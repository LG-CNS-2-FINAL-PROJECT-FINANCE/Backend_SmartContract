// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";
import {IFunctionsSubscriptions} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/interfaces/IFunctionsSubscriptions.sol";

contract FractionalInvestmentToken is ERC20Permit, Ownable, FunctionsClient, Pausable {
    using FunctionsRequest for FunctionsRequest.Request;
    
    IFunctionsSubscriptions public functionsSubscriptions;

    bytes32 public immutable projectId;
    uint256 public immutable totalInvestmentAmount;
    uint256 public immutable minInvestmentAmount;
    uint256 public immutable totalTokenAmount;

    // Chainlink Functions 설정
    uint64 private s_subscriptionId;
    bytes32 private s_donId;
    string private s_investmentSourceCode;
    string private s_tradeSourceCode;
    uint32 private constant GAS_LIMIT = 300000;

    // --- 1차 발행 관련 상태 변수 (key = investmentId) ---
    struct investment {
        address investmentor;
        uint256 tokenAmount;
        bool processState;
    }
    mapping(string => investment) public investmentRecord;
    mapping(bytes32 => string) public investmentKey; // (chainlinkId -> investmentId)

    // --- 2차 거래 구매 요청 관련 상태 변수 (key = tradeId) ---
    struct trade {
        address seller;
        address buyer;
        uint256 tokenAmount;
        bool processState;
        bool depositState;
    }
    mapping(string => trade) public tradeRecord;
    mapping(bytes32 => string) public tradeKey; // (chainlinkId -> tradeId)

    // --- 토큰 전송이 불가 기간 ---
    mapping(address => uint256) private lockupUntil;

    event InvestmentRequested(
        bytes32 indexed projectId,
        string indexed investmentId,
        bytes32 indexed chainlinkRequestId,
        address buyer,
        uint256 tokenAmount
    );
    event InvestmentSuccessful(
        bytes32 indexed projectId,
        string indexed investmentId,
        bytes32 indexed chainlinkRequestId,
        address buyer,
        uint256 tokenAmount,
        string chainlinkResult
    );
    event InvestmentFailed(
        bytes32 indexed projectId,
        string indexed investmentId,
        bytes32 indexed chainlinkRequestId,
        string reason
    );

    event TradeRequested(
        bytes32 indexed projectId,
        string indexed tradeId,
        bytes32 indexed chainlinkRequestId,
        address seller,
        address buyer,
        uint256 tokenAmount
    );
    event TradeSuccessful(
        bytes32 indexed projectId,
        string indexed tradeId,
        bytes32 indexed chainlinkRequestId,
        address seller,
        address buyer,
        uint256 tokenAmount,
        string chainlinkResult
    );
    event TradeFailed(
        bytes32 indexed projectId,
        string indexed tradeId,
        bytes32 indexed chainlinkRequestId,
        string reason
    );

    /**
     * @dev FractionalInvestmentToken 컨트랙트의 생성자입니다.
     */
    constructor(
        bytes32 _projectId,
        string memory _name,
        string memory _symbol,
        uint256 _totalAmount,
        uint256 _minInvestmentAmount,
        address _router,
        uint64 _subscriptionId,
        bytes32 _donId,
        string memory _investmentSourceCode,
        string memory _tradeSourceCode
    )
        ERC20(_name, _symbol)
        ERC20Permit(_name)
        Ownable(msg.sender)
        FunctionsClient(_router)
    {
        require(_projectId.length > 0, "Project ID can not empty");
        require(_minInvestmentAmount > 0, "Minimum investment amount must be greater than 0");
        require(_totalAmount >= _minInvestmentAmount, "Total goal must be at least minimum investment amount");
        require(_totalAmount % _minInvestmentAmount == 0, "Total goal must be perfectly divisible by minimum investment amount");

        // token info
        projectId = _projectId;
        totalInvestmentAmount = _totalAmount;
        minInvestmentAmount = _minInvestmentAmount;
        totalTokenAmount = totalInvestmentAmount / minInvestmentAmount;

        functionsSubscriptions = IFunctionsSubscriptions(_router);
        s_subscriptionId = _subscriptionId;
        s_donId = _donId;
        s_investmentSourceCode = _investmentSourceCode;
        s_tradeSourceCode = _tradeSourceCode;

        // issue token
        _mint(address(this), totalTokenAmount * (10 ** decimals()));
    }

    // 일시 중지 기능
    function pause() public onlyOwner {
        _pause();
    }
    function unpause() public onlyOwner {
        _unpause();
    }

    // 새로 추가된 부분: 컨트랙트 소유자만 컨슈머 등록 가능
    function registerAsConsumer() public onlyOwner {
        functionsSubscriptions.addConsumer(s_subscriptionId, address(this));
    }

    // 토큰 락업 기간을 설정
    function setLockup(address _account, uint256 _unlockTime) public onlyOwner {
        require(_unlockTime > block.timestamp, "Unlock time must be in the future.");
        lockupUntil[_account] = _unlockTime;
    }

    function _update(address from, address to, uint256 value) internal virtual override {
        if (from != address(0)) {
            require(lockupUntil[from] <= block.timestamp, "Tokens are locked for this account.");
            require(!paused(), "Tokens are Paused on this contract.");
        }

        super._update(from, to, value);
    }

    // --- 1차 발행 ---
    function requestInvestment(
        string memory _investmentId,
        address _buyer,
        uint256 _tokenAmount
    ) public onlyOwner whenNotPaused {
        require(!investmentRecord[_investmentId].processState, "Initial request already processed or pending.");
        require(_buyer != address(0), "Buyer address cannot be zero.");
        require(_tokenAmount > 0, "Token amount must be greater than 0.");
        require(balanceOf(address(this)) >= _tokenAmount * (10 ** decimals()), "Not enough tokens in contract for this initial request.");

        investmentRecord[_investmentId].investmentor = _buyer;
        investmentRecord[_investmentId].tokenAmount = _tokenAmount;

        // External API
        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(s_investmentSourceCode);

        // Transfer Parameters to Javascript Source Code
        string[] memory args = new string[](1);
        args[0] = _investmentId;
        req.setArgs(args);

        // 외부 요청 API KEY
        // if (encryptedSecretsUrls.length > 0)
        //      req.addSecretsReference(encryptedSecretsUrls);
        // }

        bytes32 chainlinkReqId = _sendRequest(req.encodeCBOR(), s_subscriptionId, GAS_LIMIT, s_donId);
        investmentKey[chainlinkReqId] = _investmentId;

        emit InvestmentRequested(projectId, _investmentId, chainlinkReqId, _buyer, _tokenAmount);
    }

    function fulfillRequest(
        bytes32 _chainlinkRequestId,
        bytes memory _response,
        bytes memory _err
    ) internal override {
        string memory investmentId = investmentKey[_chainlinkRequestId];
        string memory tradeId = tradeKey[_chainlinkRequestId];

        if (bytes(investmentId).length > 0) {
            _handleInvestmentFulfillment(_chainlinkRequestId, investmentId, _response, _err);
        } else if (bytes(tradeId).length > 0) {
            _handleTradeFulfillment(_chainlinkRequestId, tradeId, _response, _err);
        } else {
            revert("Unknown Chainlink request ID");
        }
    }

    function _handleInvestmentFulfillment(
        bytes32 _chainlinkRequestId,
        string memory _investmentId,
        bytes memory _response,
        bytes memory _err
    ) private {
        if (investmentProcessed[_investmentId]) {
            emit InvestmentFailed(projectId, _investmentId, _chainlinkRequestId, "Request already processed.");
            return;
        }

        if (_err.length > 0) {
            emit InvestmentFailed(projectId, _investmentId, _chainlinkRequestId, "Chainlink Functions request failed.");
            return;
        }

        address buyer = investmentRecord[_investmentId].investmentor;
        uint256 amount = investmentRecord[_investmentId].tokenAmount;

        uint256 result = abi.decode(_response, (uint256));

        if (result == 1) {
            if (balanceOf(address(this)) >= amount * (10 ** decimals())) {         
                _transfer(address(this), buyer, amount * (10 ** decimals()));

                investmentRecord[_investmentId].processState = true;

                emit InvestmentSuccessful(projectId, _investmentId, _chainlinkRequestId, buyer, amount, "Initial payment verified");
            } else {
                emit InvestmentFailed(projectId, _investmentId, _chainlinkRequestId, "Insufficient contract token supply for initial transfer.");
            }
        } else {
            emit InvestmentFailed(projectId, _investmentId, _chainlinkRequestId, "Initial payment verification failed.");
        }
    }

    // --- 2차 거래 ---
    function requestTradeWithPermit(
        string memory _tradeId,
        address _seller,
        address _buyer,
        uint256 _tokenAmount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public onlyOwner whenNotPaused {
        require(!tradeProcessed[_tradeId], "Purchase request already processed or pending.");
        require(_seller != address(0), "Seller address cannot be zero.");
        require(_buyer != address(0), "Buyer address cannot be zero.");
        require(_tokenAmount > 0, "Tokens to transfer must be greater than 0.");
        require(bytes(s_tradeSourceCode).length > 0,"Source code not set.");
        require(balanceOf(_seller) >= _tokenAmount * (10 ** decimals()), "Seller's token balance is insufficient for trade request.");

        permit(_seller, address(this), _tokenAmount * (10 ** decimals()), deadline, v, r, s);

        tradeSeller[_tradeId] = _seller;
        tradeBuyer[_tradeId] = _buyer;
        tradeTokenAmount[_tradeId] = _tokenAmount;

        // Request External API
        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(s_tradeSourceCode);

        // Transfer Parameters to Javascript Source Code
        string[] memory args = new string[](1);
        args[0] = _tradeId;
        req.setArgs(args);

        // 외부 요청 API KEY
        // if (encryptedSecretsUrls.length > 0)
        //      req.addSecretsReference(encryptedSecretsUrls);
        // }

        bytes32 chainlinkReqId = _sendRequest(req.encodeCBOR(), s_subscriptionId, GAS_LIMIT, s_donId);
        tradeKey[chainlinkReqId] = _tradeId;

        emit TradeRequested(projectId, _tradeId, chainlinkReqId, _seller, _buyer, _tokenAmount);
    }

    function _handleTradeFulfillment(
        bytes32 _chainlinkRequestId,
        string memory _tradeId,
        bytes memory _response,
        bytes memory _err
    ) private {
        if (tradeProcessed[_tradeId]) {
            emit TradeFailed(projectId, _tradeId, _chainlinkRequestId, "Request already processed.");
            return;
        }

        if (_err.length > 0) {
            emit TradeFailed(projectId, _tradeId, _chainlinkRequestId, "Chainlink Functions request failed.");
            return;
        }

        address seller = tradeSeller[_tradeId];
        address buyer = tradeBuyer[_tradeId];
        uint256 amount = tradeTokenAmount[_tradeId];

        uint256 result = abi.decode(_response, (uint256));

        if (result == 1) {
            uint256 tradeAmount = amount * (10 ** decimals());
            require(allowance(seller, address(this)) >= tradeAmount, "Seller's allowance to contract is insufficient for transfer.");
            require(balanceOf(seller) >= tradeAmount, "Seller's balance is insufficient for transfer.");
            
            transferFrom(seller, buyer, tradeAmount);

            tradeProcessed[_tradeId] = true;

            emit TradeSuccessful(projectId, _tradeId, _chainlinkRequestId, seller, buyer, amount, "Off-chain purchase verified");
        } else {
            emit TradeFailed(projectId, _tradeId, _chainlinkRequestId, "Off-chain purchase verification failed.");
        }
    }

    // --- 비상/관리자 함수 (선택 사항) ---
    function burnContractTokens(uint256 _amount) public onlyOwner {
        _burn(address(this), _amount);
    }

    function transferTokensFromContract(address _to, uint256 _amount) public onlyOwner {
        require(balanceOf(address(this)) >= _amount, "Insufficient contract tokens.");
        _transfer(address(this), _to, _amount);
    }
}
