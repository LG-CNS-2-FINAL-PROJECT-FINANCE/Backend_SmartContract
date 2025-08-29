// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
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

    // Error Status Code
    uint32 private constant REPEAT_FAILED = 0;
    uint32 private constant CHAINLINK_FAILED = 1;
    uint32 private constant SMART_CONTRACT_FAILED = 2;
    uint32 private constant EXTERNAL_API_FAILED = 3;

    // Chainlink Functions 설정
    uint64 private s_subscriptionId;
    bytes32 private s_donId;
    string private s_investmentSourceCode;
    string private s_tradeSourceCode;
    uint32 private constant GAS_LIMIT = 300000;

    // --- 1차 발행 관련 상태 변수 (key = investmentId) ---
    struct investment {
        string investId;
        address investmentor;
        uint256 tokenAmount;
        bool processState;
    }
    mapping(string => investment) public investmentRecord;
    mapping(bytes32 => string[]) public investmentKey; // (chainlinkId -> investmentId)

    // --- 2차 거래 관련 상태 변수 ---
    // --- 2차 거래 판매 요청 (key = sellId) ---
    struct sell {
        address seller;
        uint256 depositAmount;
        bool depositState;
    }
    mapping(string => sell) public sellRecord;

    // --- 2차 거래 구매 요청 (key = buyId) ---
    struct buy {
        address buyer;
        uint256 buyAmount;
    }
    mapping(string => buy) public buyRecord;

    // --- 2차 거래 체결 요청 (key = tradeId) ---
    struct trade {
        string sellId;
        string buyId;
        uint256 tradePricePerToken;
        bool processState;
    }
    mapping(string => trade) public tradeRecord;
    mapping(bytes32 => string) public tradeKey; // (chainlinkId -> tradeId)

    // --- 토큰 전송이 불가 기간 ---
    mapping(address => uint256) private lockupUntil;

    event InvestmentRequested(bytes32 indexed projectIndex, bytes32 indexed chainlinkRequestId, bytes32 projectId, investment[] investmentList);
    event InvestmentSuccessful(bytes32 indexed projectIndex, string indexed investmentIndex, bytes32 indexed chainlinkRequestId, bytes32 projectId, string investmentId, address buyer, uint256 tokenAmount, string chainlinkResult);
    event InvestmentFailed(bytes32 indexed projectIndex, string indexed investmentIndex, bytes32 indexed chainlinkRequestId, bytes32 projectId, string investmentId, uint256 status, string reason);

    event TradeRequested(bytes32 indexed projectIndex, string indexed tradeIndex, bytes32 indexed chainlinkRequestId, bytes32 projectId, string tradeId, address seller, address buyer, uint256 tokenAmount);
    event TradeSuccessful(bytes32 indexed projectIndex, string indexed tradeIndex, bytes32 indexed chainlinkRequestId, bytes32 projectId, string tradeId, address seller, address buyer, uint256 tokenAmount, string chainlinkResult);
    event TradeFailed(bytes32 indexed projectIndex, string indexed tradeIndex, bytes32 indexed chainlinkRequestId, bytes32 projectId, string tradeId, uint256 status, string reason);

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
    function requestInvestment(investment[] memory _investments) public onlyOwner whenNotPaused {
        string[] memory args = new string[](_investments.length);
        string[] memory investmentIdList = new string[](_investments.length);

        for (uint i = 0; i < _investments.length; i++) {
            require(!investmentRecord[_investments[i].investId].processState, "Initial request already processed or pending.");
            require(_investments[i].investmentor != address(0), "Buyer address cannot be zero.");
            require(_investments[i].tokenAmount > 0, "Token amount must be greater than 0.");
            require(balanceOf(address(this)) >= _investments[i].tokenAmount * (10 ** decimals()), "Not enough tokens in contract for this initial request.");
        }

        for (uint i = 0; i < _investments.length; i++) {
            investmentRecord[_investments[i].investId].investmentor = _investments[i].investmentor;
            investmentRecord[_investments[i].investId].tokenAmount = _investments[i].tokenAmount;

            string memory investorData = string(abi.encodePacked(
                _investments[i].investId, ",",
                Strings.toHexString(_investments[i].investmentor), ",", // 주소 변환
                Strings.toString(_investments[i].tokenAmount) // uint256 변환
            ));
            args[i] = investorData;

            investmentIdList[i] = _investments[i].investId;
        }

        // External API
        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(s_investmentSourceCode);

        // Transfer Parameters to Javascript Source Code
        req.setArgs(args);

        // 외부 요청 API KEY
        // if (encryptedSecretsUrls.length > 0)
        //      req.addSecretsReference(encryptedSecretsUrls);
        // }

        bytes32 chainlinkReqId = _sendRequest(req.encodeCBOR(), s_subscriptionId, GAS_LIMIT, s_donId);
        investmentKey[chainlinkReqId] = investmentIdList;

        emit InvestmentRequested(projectId, chainlinkReqId, projectId, _investments);
    }

    function fulfillRequest(
        bytes32 _chainlinkRequestId,
        bytes memory _response,
        bytes memory _err
    ) internal override {
        string[] memory investmentIdList = investmentKey[_chainlinkRequestId];
        string memory tradeId = tradeKey[_chainlinkRequestId];

        if (bytes(tradeId).length > 0) {
            uint256 result = abi.decode(_response, (uint256));

            _handleTradeFulfillment(_chainlinkRequestId, tradeId, result, _err);
        }
        else if (investmentIdList.length > 0) {
            uint256[] memory results;
            if (_response.length > 0) {
                results = abi.decode(_response, (uint256[]));
            }

            for (uint i = 0; i < investmentIdList.length; i++) {
                uint256 result = (results.length > i) ? results[i] : 0;
                _handleInvestmentFulfillment(
                    _chainlinkRequestId,
                    investmentIdList[i],
                    result,
                    _err
                );
            }
        } else {
            revert("Unknown Chainlink request ID");
        }
    }

    function _handleInvestmentFulfillment(
        bytes32 _chainlinkRequestId,
        string memory _investmentId,
        uint256 _result,
        bytes memory _err
    ) private {
        if (investmentRecord[_investmentId].processState) {
            emit InvestmentFailed(projectId, _investmentId, _chainlinkRequestId, projectId, _investmentId, REPEAT_FAILED, "Request already processed.");
            return;
        }

        if (_err.length > 0) {
            emit InvestmentFailed(projectId, _investmentId, _chainlinkRequestId, projectId, _investmentId, CHAINLINK_FAILED, "Chainlink Functions request failed.");
            return;
        }

        address buyer = investmentRecord[_investmentId].investmentor;
        uint256 amount = investmentRecord[_investmentId].tokenAmount;

        if (_result == 1) {
            if (balanceOf(address(this)) >= amount * (10 ** decimals())) {         
                _transfer(address(this), buyer, amount * (10 ** decimals()));

                investmentRecord[_investmentId].processState = true;

                emit InvestmentSuccessful(projectId, _investmentId, _chainlinkRequestId, projectId, _investmentId, buyer, amount, "Initial payment verified");
            } else {
                // 심각한 에러 발생 : 내부 로직 오류
                emit InvestmentFailed(projectId, _investmentId, _chainlinkRequestId, projectId, _investmentId, SMART_CONTRACT_FAILED, "Insufficient contract token supply for initial transfer.");
                pause();
            }
        } else {
            emit InvestmentFailed(projectId, _investmentId, _chainlinkRequestId, projectId, _investmentId, EXTERNAL_API_FAILED, "Initial payment verification failed.");
        }
    }

    // --- 2차 거래 ---
    // 판매자가 토큰을 예치하고, 컨트랙트가 토큰 사용 권한을 부여받는 함수
    function depositWithPermit(
        string memory _sellId, 
        address _seller,
        uint256 _depositAmount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public onlyOwner whenNotPaused {
        // 1. 유효성 검사
        require(!sellRecord[_sellId].depositState, "Trade Deposit request already processed or pending.");
        require(_seller != address(0), "Addresses cannot be zero.");
        require(_depositAmount > 0, "Tokens to transfer must be greater than 0.");
        
        // 2. 판매자 토큰 잔액 확인
        uint256 depoistAmountWei = _depositAmount * (10 ** decimals());
        require(balanceOf(_seller) >= depoistAmountWei, "Seller's token balance is insufficient.");

        // 3. 서명을 통해 컨트랙트에 토큰 사용 권한 부여
        permit(_seller, address(this), depoistAmountWei, deadline, v, r, s);

        // 4. 토큰 예치 (실제 토큰 이동)
        _transfer(_seller, address(this), depoistAmountWei);

        // 5. 거래 정보 저장
        sellRecord[_sellId].seller = _seller;
        sellRecord[_sellId].depositAmount = _depositAmount;
        sellRecord[_sellId].depositState = true;
    }

    function cancelDeposit(
        string memory _sellId, 
        address _seller,
        uint256 _cancelAmount,
        bytes32 _hashedMessage,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public onlyOwner whenNotPaused {
        // 1. 서명자 주소를 복구
        bytes32 prefixedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", _hashedMessage));
        address signer = ecrecover(prefixedHash, v, r, s);
        
        // 2. 서명자 일치 확인 (서명 검증)
        require(signer != address(0), "Invalid signature.");
        require(signer == _seller, "Signer is not the provided seller address.");

        // 3. 기록 일치 여부 확인
        require(sellRecord[_sellId].depositState, "No active deposit for this ID.");
        require(sellRecord[_sellId].seller == _seller, "Seller is not matched for this deposit.");
        require(sellRecord[_sellId].depositAmount >= _cancelAmount, "Sell Amount is not matched for this deposit.");

        // 4. 토큰 예치 취소 가능 여부 확인 
        uint256 cancelAmountWei = _cancelAmount * (10 ** decimals());
        require(balanceOf(address(this)) >= cancelAmountWei, "Smart Contract's token balance is insufficient.");

        // 5. 토큰 예치 취소 진행
        _transfer(address(this), _seller, cancelAmountWei);
        
        // 6. 토큰 예치 취소에 따른 개수 감소
        sellRecord[_sellId].depositAmount -= _cancelAmount;
        if (sellRecord[_sellId].depositAmount == 0) {
            delete sellRecord[_sellId];
        }
    }

    function requestTrade(
        string memory _tradeId,
        string memory _sellId,
        address _seller,
        string memory _buyId,
        address _buyer,
        uint256 _tradeAmount,
        uint256 _tradePricePerToken
    ) public onlyOwner whenNotPaused {
        // 1. 유효성 검사
        require(!tradeRecord[_tradeId].processState, "Trade request already processed or pending.");
        require(sellRecord[_sellId].depositState, "Trade Deposit request is not processed or pending.");

        require(_buyer != address(0) && _seller != address(0), "Addresses cannot be zero.");
        require(_seller == sellRecord[_sellId].seller, "Seller does not match transaction history");
        require(_tradeAmount <= sellRecord[_sellId].depositAmount, "Deposit Amount must be bigger than Trade Amount.");
        require(balanceOf(address(this)) >= _tradeAmount * (10 ** decimals()), "Contract holding amount is insufficient than Trade Token Amount.");

        require(bytes(s_tradeSourceCode).length > 0,"Source code not set.");

        // 2. 구매 정보 업데이트
        buyRecord[_buyId].buyer = _buyer;
        buyRecord[_buyId].buyAmount = _tradeAmount;

        // 3. 거래 체결 정보 저장
        tradeRecord[_tradeId].sellId = _sellId;
        tradeRecord[_tradeId].buyId = _buyId;
        tradeRecord[_tradeId].tradePricePerToken = _tradePricePerToken;
        tradeRecord[_tradeId].processState = false;

        // External API
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

        emit TradeRequested(projectId, _tradeId, chainlinkReqId, projectId, _tradeId, _seller, _buyer, _tradeAmount);
    }

    function _handleTradeFulfillment(
        bytes32 _chainlinkRequestId,
        string memory _tradeId,
        uint256 _result,
        bytes memory _err
    ) private {
        if (tradeRecord[_tradeId].processState) {
            emit TradeFailed(projectId, _tradeId, _chainlinkRequestId, projectId, _tradeId, REPEAT_FAILED, "Request already processed.");
            return;
        }

        if (_err.length > 0) {
            emit TradeFailed(projectId, _tradeId, _chainlinkRequestId, projectId, _tradeId, CHAINLINK_FAILED, "Chainlink Functions request failed.");
            return;
        }

        sell storage tradeSell = sellRecord[tradeRecord[_tradeId].sellId];
        buy memory tradeBuy = buyRecord[tradeRecord[_tradeId].buyId];
        uint256 tradeAmount = tradeBuy.buyAmount;
        uint256 tradeAmountWei = tradeAmount * (10 ** decimals());

        if (_result == 1) {
            if (balanceOf(address(this)) < tradeAmountWei) {
                emit TradeFailed(projectId, _tradeId, _chainlinkRequestId, projectId, _tradeId, SMART_CONTRACT_FAILED, "Insufficient contract token supply for transfer.");
                pause();
                return;
            }

            if (tradeSell.depositAmount < tradeAmount) {
                emit TradeFailed(projectId, _tradeId, _chainlinkRequestId, projectId, _tradeId, SMART_CONTRACT_FAILED, "Insufficient deposit token supply for transfer.");
                pause();
                return;
            }
            
            _transfer(address(this), tradeBuy.buyer, tradeAmountWei);

            tradeRecord[_tradeId].processState = true;

            tradeSell.depositAmount -= tradeAmount;

            emit TradeSuccessful(projectId, _tradeId, _chainlinkRequestId, projectId, _tradeId, tradeSell.seller, tradeBuy.buyer, tradeAmount, "Off-chain purchase verified");
        } else {
            if (balanceOf(address(this)) < tradeAmountWei) {
                emit TradeFailed(projectId, _tradeId, _chainlinkRequestId, projectId, _tradeId, SMART_CONTRACT_FAILED, "Insufficient contract token supply for refund. Check previous transactions.");
                pause();
                return;
            }
            
            _transfer(address(this), tradeSell.seller, tradeAmountWei);

            tradeSell.depositState = false;
            
            emit TradeFailed(projectId, _tradeId, _chainlinkRequestId, projectId, _tradeId, EXTERNAL_API_FAILED, "Off-chain purchase verification failed. Tokens returned to seller.");
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
