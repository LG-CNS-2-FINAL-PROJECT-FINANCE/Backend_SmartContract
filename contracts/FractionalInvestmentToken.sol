// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";
import {ConfirmedOwner} from "@chainlink/contracts/src/v0.8/shared/access/ConfirmedOwner.sol";
import {IFunctionsSubscriptions} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/interfaces/IFunctionsSubscriptions.sol";

/**
 * @title FractionalInvestmentToken
 * @dev 오프체인 원화(₩) 투자에 연동하여 조각 투자 상품의 지분을 나타내는 ERC-20 토큰 컨트랙트
 * Chainlink Functions를 통해 오프체인 결제 확인 후, 판매자의 토큰을 구매자에게 직접 이전
 * Gelato Relayer (EIP-2771) 호환을 지원하여 사용자가 가스비 없이 상호작용 가능
 */
contract FractionalInvestmentToken is ERC20, ConfirmedOwner, FunctionsClient, ERC2771Context, Pausable {
    using FunctionsRequest for FunctionsRequest.Request;
    
    IFunctionsSubscriptions public functionsSubscriptions;

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
    mapping(string => address) public investmentor;
    mapping(string => uint256) public investmentTokenAmount;
    mapping(string => bool) public investmentProcessed;
    mapping(bytes32 => string) public investmentKey; // (chainlinkId -> userRequestId)

    // --- 2차 거래 구매 요청 관련 상태 변수 (key = tradeId) ---
    mapping(string => address) public tradeSeller;
    mapping(string => address) public tradeBuyer;
    mapping(string => uint256) public tradeTokenAmount;
    mapping(string => bool) public tradeProcessed;
    mapping(bytes32 => string) public tradeKey; // (chainlinkId -> tradeId)

    // --- 토큰 전송이 불가 기간 ---
    mapping(address => uint256) private lockupUntil;

    event InvestmentRequested(
        string indexed userRequestId,
        address indexed buyer,
        uint256 tokenAmount,
        bytes32 chainlinkRequestId
    );
    event InvestmentSuccessful(
        string indexed userRequestId,
        address indexed buyer,
        uint256 tokenAmount,
        bytes32 chainlinkRequestId,
        string chainlinkResult
    );
    event InvestmentFailed(
        string indexed userRequestId,
        bytes32 indexed chainlinkRequestId,
        string reason
    );

    event TradeRequested(
        string indexed tradeId,
        address indexed seller,
        address indexed buyer,
        uint256 tokenAmount,
        bytes32 chainlinkRequestId
    );
    event TradeSuccessful(
        string indexed tradeId,
        address indexed seller,
        address indexed buyer,
        uint256 tokenAmount,
        bytes32 chainlinkRequestId,
        string chainlinkResult
    );
    event TradeFailed(
        string indexed tradeId,
        bytes32 indexed chainlinkRequestId,
        string reason
    );

    /**
     * @dev FractionalInvestmentToken 컨트랙트의 생성자입니다.
     */
    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _totalAmount,
        uint256 _minInvestmentAmount,
        address _trustedForwarder,
        address _router,
        uint64 _subscriptionId,
        bytes32 _donId,
        string memory _investmentSourceCode,
        string memory _tradeSourceCode
    )
        ERC20(_name, _symbol)
        ConfirmedOwner(msg.sender)
        FunctionsClient(_router)
        ERC2771Context(_trustedForwarder)
    {
        require(_minInvestmentAmount > 0, "Minimum investment amount must be greater than 0");
        require(_totalAmount >= _minInvestmentAmount, "Total goal must be at least minimum investment amount");
        require(_totalAmount % _minInvestmentAmount == 0, "Total goal must be perfectly divisible by minimum investment amount");
        require(_trustedForwarder != address(0), "Trusted Forwarder address cannot be zero");

        // token info
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

    // --- 다이아몬드 상속 문제 해결 (ERC2771Context의 함수를 사용) ---
    function _msgSender() internal view virtual override(Context, ERC2771Context) returns (address) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view virtual override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }

    function _contextSuffixLength() internal view virtual override(Context, ERC2771Context) returns (uint256) {
        return ERC2771Context._contextSuffixLength();
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
        require(!investmentProcessed[_investmentId], "Initial request already processed or pending.");
        require(_buyer != address(0), "Buyer address cannot be zero.");
        require(_tokenAmount > 0, "Token amount must be greater than 0.");
        require(balanceOf(address(this)) >= _tokenAmount * (10 ** decimals()), "Not enough tokens in contract for this initial request.");

        investmentor[_investmentId] = _buyer;
        investmentTokenAmount[_investmentId] = _tokenAmount;

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

        emit InvestmentRequested(_investmentId, _buyer, _tokenAmount, chainlinkReqId);
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
            emit InvestmentFailed(_investmentId, _chainlinkRequestId, "Request already processed.");
            return;
        }

        if (_err.length > 0) {
            emit InvestmentFailed(_investmentId, _chainlinkRequestId, "Chainlink Functions request failed.");
            return;
        }

        address buyer = investmentor[_investmentId];
        uint256 amount = investmentTokenAmount[_investmentId];

        uint256 result = abi.decode(_response, (uint256));

        if (result == 1) {
            if (balanceOf(address(this)) >= amount * (10 ** decimals())) {         
                _transfer(address(this), buyer, amount * (10 ** decimals()));

                investmentProcessed[_investmentId] = true;

                emit InvestmentSuccessful(_investmentId, buyer, amount, _chainlinkRequestId, "Initial payment verified");
            } else {
                emit InvestmentFailed(_investmentId, _chainlinkRequestId, "Insufficient contract token supply for initial transfer.");
            }
        } else {
            emit InvestmentFailed(_investmentId, _chainlinkRequestId, "Initial payment verification failed.");
        }
    }

    // --- 2차 거래 ---
    function requestTrade(
        string memory _tradeId,
        address _seller,
        address _buyer,
        uint256 _tokenAmount
    ) public onlyOwner whenNotPaused {
        require(!tradeProcessed[_tradeId], "Purchase request already processed or pending.");
        require(_seller != address(0), "Seller address cannot be zero.");
        require(_buyer != address(0), "Buyer address cannot be zero.");
        require(_tokenAmount > 0, "Tokens to transfer must be greater than 0.");
        require(bytes(s_tradeSourceCode).length > 0, "Source code not set");

        uint256 tradeAmount = _tokenAmount * (10 ** decimals());

        require(balanceOf(_seller) >= tradeAmount, "Seller's token balance is insufficient for trade request.");
        require(allowance(_seller, address(this)) >= tradeAmount, "Seller's allowance to contract is insufficient for transfer.");

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

        emit TradeRequested(_tradeId, _seller, _buyer, _tokenAmount, chainlinkReqId);
    }

    function _handleTradeFulfillment(
        bytes32 _chainlinkRequestId,
        string memory _tradeId,
        bytes memory _response,
        bytes memory _err
    ) private {
        if (tradeProcessed[_tradeId]) {
            emit TradeFailed(_tradeId, _chainlinkRequestId, "Request already processed.");
            return;
        }

        if (_err.length > 0) {
            emit TradeFailed(_tradeId, _chainlinkRequestId, "Chainlink Functions request failed.");
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
            
            _transfer(seller, buyer, tradeAmount);

            tradeProcessed[_tradeId] = true;

            emit TradeSuccessful(_tradeId, seller, buyer, amount, _chainlinkRequestId, "Off-chain purchase verified");
        } else {
            emit TradeFailed(_tradeId, _chainlinkRequestId, "Off-chain purchase verification failed.");
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
