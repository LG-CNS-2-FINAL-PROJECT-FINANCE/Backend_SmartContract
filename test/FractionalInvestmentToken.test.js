// test/FractionalInvestmentToken.test.js

const { expect } = require("chai");
const { ethers } = require("hardhat");
require("dotenv").config();

describe("FractionalInvestmentToken (Local Tests without Chainlink)", function () {
    let token;
    let deployer;
    let otherAccount;
    let router;
    let subscriptionId;
    let donId;
    let projectId;
    let name;
    let symbol;
    let totalGoalAmount;
    let minAmount;

    // 테스트 환경 설정
    beforeEach(async function () {
        [deployer, otherAccount] = await ethers.getSigners();

        // Mock Router 배포
        const MockRouter = await ethers.getContractFactory("MockFunctionsRouter");
        mockRouter = await MockRouter.deploy();
        await mockRouter.waitForDeployment();
        
        // Chainlink Functions를 건너뛰기 위해 모든 파라미터에 더미 값을 사용합니다.
        router = await mockRouter.getAddress(); 
        subscriptionId = 0; 
        donId = ethers.ZeroHash;

        // JavaScript 소스 코드 모킹
        const investmentSourceCode = "return Functions.encodeUint256(1);";
        const tradeSourceCode = "return Functions.encodeUint256(1);";

        projectId = ethers.encodeBytes32String("Test Project Id");
        name = "Depoly Test Fractional Investment Token";
        symbol = "DTFIT";
        totalGoalAmount = 1000000;
        minAmount = 100;

        const FractionalInvestmentToken = await ethers.getContractFactory("FractionalInvestmentToken");
        token = await FractionalInvestmentToken.deploy(
            projectId,
            name,
            symbol,
            totalGoalAmount,
            minAmount,
            router,
            subscriptionId,
            donId,
            investmentSourceCode,
            tradeSourceCode
        );

        await token.waitForDeployment();
    });

    // --- ERC-20 및 기본 컨트랙트 기능 테스트 ---
    describe("Initialization & ERC-20", function () {
        it("컨트랙트가 올바르게 배포되어야 한다", async function () {
            expect(await token.name()).to.equal(name);
            expect(await token.symbol()).to.equal(symbol);
            expect(await token.owner()).to.equal(deployer.address);
        });

        it("총 발행량과 계약 잔액이 올바르게 설정되어야 한다", async function () {
            const totalTokens = await token.totalTokenAmount();
            const totalSupply = await token.totalSupply();
            const decimals = await token.decimals();
            const expectedTotalSupply = totalTokens * (10n ** decimals);

            expect(totalSupply).to.equal(expectedTotalSupply);
            expect(await token.balanceOf(await token.getAddress())).to.equal(expectedTotalSupply);
        });
    });
    
    // --- 추가된 관리 기능 테스트 ---
    describe("Management Functions", function () {
        it("관리자만 컨트랙트를 일시 중지/재개할 수 있어야 한다", async function () {
            await token.pause();
            expect(await token.paused()).to.be.true;

            await token.unpause();
            expect(await token.paused()).to.be.false;
        });

        it("토큰 락업 기간이 올바르게 설정되어야 한다", async function () {
            const now = (await ethers.provider.getBlock("latest")).timestamp;
            const unlockTime = now + 1000;

            await token.setLockup(deployer.address, unlockTime);
            
            await token.transferTokensFromContract(deployer.address, 100);
            expect(await token.balanceOf(deployer.address)).to.equal(100);

            await expect(token.connect(deployer).transfer(deployer.address, 10)).to.be.revertedWith("Tokens are locked for this account.");
        });

        it("(투자) 컨트랙트 일시 중지인 경우, 토큰 전송이 불가해야 한다", async function () {
            await token.pause();

            await expect(token.transferTokensFromContract(deployer.address, 100)).to.be.revertedWith("Tokens are Paused on this contract.");
            expect(await token.balanceOf(deployer.address)).to.equal(0);
            
            await token.unpause();
        });

        it("(거래) 컨트랙트 일시 중지인 경우, 토큰 전송이 불가해야 한다", async function () {
            await token.transferTokensFromContract(deployer.address, 100);
            expect(await token.balanceOf(deployer.address)).to.equal(100);

            await token.pause();

            await expect(token.connect(deployer).transfer(await token.getAddress(), 10)).to.be.revertedWith("Tokens are Paused on this contract.");
            expect(await token.balanceOf(deployer.address)).to.equal(100);
            
            await token.unpause();
        });
    });

    // --- Chainlink Functions 호출을 직접 모킹하여 테스트 ---
    describe("Directly Mocking Chainlink Functions Calls", function () {
        it("`requestInvestment`가 단일 투자를 성공적으로 처리해야 한다", async function () {
            const investmentData = {
                investId: `INV-${Date.now()}-single`,
                investmentor: otherAccount.address,
                tokenAmount: 100,
                processState: false
            };

            const investments = [investmentData];
            const amountWei = BigInt(investmentData.tokenAmount) * (10n ** (await token.decimals()));
            
            const tx = await token.requestInvestment(investments);
            const receipt = await tx.wait();

            const event = receipt.logs.find(log => log.fragment && log.fragment.name === "InvestmentRequested");
            const reqId = event.args[1];
            
            const successResponse = ethers.AbiCoder.defaultAbiCoder().encode(["uint256[]"], [[1]]);
            
            await expect(mockRouter.fulfillRequest(reqId, successResponse, "0x"))
                .to.emit(token, "InvestmentSuccessful");

            expect(await token.balanceOf(otherAccount.address)).to.equal(amountWei);
        });

        it("`requestInvestment`가 10명의 다수 투자를 성공적으로 처리해야 한다", async function () {
            const investments = [];
            const initialAmount = 10;
            let totalTokenAmount = 0;
            
            for (let i = 0; i < 10; i++) {
                const tokenAmount = initialAmount + i * 10;
                const investorAddress = deployer;
                
                investments.push({
                    investId: `INV-${Date.now()}-multi-${i}`,
                    investmentor: investorAddress.address,
                    tokenAmount: tokenAmount,
                    processState: false
                });
                
                totalTokenAmount += tokenAmount;
            }

            const totalAmountWei = BigInt(totalTokenAmount) * (10n ** (await token.decimals()));
            
            const tx = await token.requestInvestment(investments);
            const receipt = await tx.wait();

            const event = receipt.logs.find(log => log.fragment && log.fragment.name === "InvestmentRequested");
            const reqId = event.args[1];    
            
            const successResults = Array(10).fill(1);
            const successResponse = ethers.AbiCoder.defaultAbiCoder().encode(["uint256[]"], [successResults]);

            await expect(mockRouter.fulfillRequest(reqId, successResponse, "0x"))
                .to.emit(token, "InvestmentSuccessful");

            expect(await token.balanceOf(deployer.address)).to.equal(totalAmountWei);   
        });

        it("`requestTrade`가 성공적으로 호출되어야 하고, `fulfillRequest`를 직접 호출하여 처리할 수 있어야 한다", async function () {
            const sellId = `SELL-${Date.now()}`;
            const seller = otherAccount;
            
            const buyId = `BUY-${Date.now()}`;
            const buyer = deployer;

            const tradeId = `TRADE-${Date.now()}`;
            const tokenAmount = 100;
            const decimals = await token.decimals();
            const amountWei = BigInt(tokenAmount) * (10n ** decimals);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const tradePricePerToken = 10; // 새로운 변수 추가

            await token.transferTokensFromContract(seller.address, amountWei);

            const nonce = await token.nonces(seller.address);
            const value = amountWei;
            const domain = { name: await token.name(), version: "1", chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await token.getAddress() };
            const types = { Permit: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] };
            const permitMessage = { owner: seller.address, spender: await token.getAddress(), value: value, nonce: nonce, deadline: deadline };
            const signature = await otherAccount.signTypedData(domain, types, permitMessage);
            const { v, r, s } = ethers.Signature.from(signature);

            await token.depositWithPermit(sellId, seller.address, tokenAmount, deadline, v, r, s);
            
            const tx = await token.connect(deployer).requestTrade(tradeId, sellId, seller.address, buyId, buyer.address, tokenAmount, tradePricePerToken);
            const receipt = await tx.wait();

            const event = receipt.logs.find(log => log.fragment && log.fragment.name === "TradeRequested");
            const reqId = event.args[2];

            const successResponse = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [1]);

            await expect(mockRouter.fulfillRequest(reqId, successResponse, "0x"))
                .to.emit(token, "TradeSuccessful")
                .withArgs(projectId, tradeId, reqId, projectId, tradeId, otherAccount.address, deployer.address, tokenAmount, "Off-chain purchase verified");

            expect(await token.balanceOf(deployer.address)).to.equal(amountWei);
        });

        it("거래 토큰량이 판매 예치 토큰량을 초과하면 `requestTrade`가 실패해야 한다", async function () {
            const sellId = `SELL-${Date.now()}`;
            const seller = otherAccount;
            
            const buyId = `BUY-${Date.now()}`;
            const buyer = deployer;

            const tradeId = `TRADE-${Date.now()}`;
            const depositAmount = 100; // 예치할 토큰 양
            const tradeAmount = 101; // 거래할 토큰 양 (예치 양보다 1 더 많음)
            const tradePricePerToken = 10;
            const decimals = await token.decimals();
            const amountWei = BigInt(depositAmount) * (10n ** decimals);
            const deadline = Math.floor(Date.now() / 1000) + 3600;

            // 테스트를 위해 판매자에게 토큰 지급
            await token.transferTokensFromContract(seller.address, amountWei);

            // Permit 서명 생성
            const nonce = await token.nonces(seller.address);
            const value = amountWei;
            const domain = { name: await token.name(), version: "1", chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await token.getAddress() };
            const types = { Permit: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] };
            const permitMessage = { owner: seller.address, spender: await token.getAddress(), value: value, nonce: nonce, deadline: deadline };
            const signature = await otherAccount.signTypedData(domain, types, permitMessage);
            const { v, r, s } = ethers.Signature.from(signature);

            // 예치 함수 호출
            await token.connect(deployer).depositWithPermit(sellId, seller.address, depositAmount, deadline, v, r, s);
            
            // 유효성 검사 (tradeAmount가 depositAmount를 초과)
            await expect(token.connect(deployer).requestTrade(tradeId, sellId, seller.address, buyId, buyer.address, tradeAmount, tradePricePerToken))
                .to.be.revertedWith("Deposit Amount must be bigger than Trade Amount.");
        });
    });

    // --- 예치 취소 테스트 (새로 추가된 부분) ---
    describe("Cancel Deposit Function", function() {
        it("판매자가 토큰을 성공적으로 예치 취소할 수 있어야 한다", async function() {
            // 1. 초기 토큰 상태 설정
            const sellId = `CANCEL-${Date.now()}`;
            const seller = otherAccount;
            const tokenAmount = 200;
            const decimals = await token.decimals();
            const amountWei = BigInt(tokenAmount) * (10n ** decimals);
            const deadline = Math.floor(Date.now() / 1000) + 3600;

            const contractInitialBalance = await token.balanceOf(await token.getAddress());

            // `onlyOwner`이기 때문에 deployer가 seller에게 토큰을 전송해야 합니다.
            await token.transferTokensFromContract(seller.address, amountWei);
            const sellerInitialBalance = await token.balanceOf(seller.address);

            // 2. depositWithPermit을 통해 토큰 예치
            const nonce = await token.nonces(seller.address);
            const value = amountWei;
            const domain = { name: await token.name(), version: "1", chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await token.getAddress() };
            const types = { Permit: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] };
            const permitMessage = { owner: seller.address, spender: await token.getAddress(), value: value, nonce: nonce, deadline: deadline };
            const signature = await otherAccount.signTypedData(domain, types, permitMessage);
            const { v, r, s } = ethers.Signature.from(signature);

            await token.depositWithPermit(sellId, seller.address, tokenAmount, deadline, v, r, s);
            
            const contractBalanceAfterDeposit = await token.balanceOf(await token.getAddress());
            const sellerBalanceAfterDeposit = await token.balanceOf(seller.address);

            expect(contractBalanceAfterDeposit).to.equal(contractInitialBalance - sellerInitialBalance + amountWei);
            expect(sellerBalanceAfterDeposit).to.equal(sellerInitialBalance - amountWei);

            // 3. cancelDeposit를 호출하기 위한 서명 메시지 생성
            const messageHash = ethers.solidityPackedKeccak256(
                ["string", "address", "uint256"],
                [sellId, seller.address, BigInt(tokenAmount)]
            );

            const { v: v2, r: r2, s: s2 } = ethers.Signature.from(await seller.signMessage(ethers.getBytes(messageHash)));

            // 4. `onlyOwner`인 deployer가 `cancelDeposit` 함수 호출
            await token.cancelDeposit(
                sellId,
                seller.address,
                tokenAmount,
                messageHash,
                v2,
                r2,
                s2
            );

            // 최종 잔액 확인
            // 예치 취소 후 컨트랙트의 최종 잔액은 초기 총 발행량에서
            // 판매자에게 보냈던 토큰 양(200)을 뺀 값이 되어야 합니다.
            const contractBalanceAfterCancel = await token.balanceOf(await token.getAddress());
            const expectedFinalContractBalance = contractBalanceAfterDeposit - BigInt(tokenAmount) * (10n ** decimals);

            // 컨트랙트의 최종 잔액 확인
            expect(contractBalanceAfterCancel).to.equal(expectedFinalContractBalance);

            // 판매자의 최종 잔액은 예치 전 초기 잔액과 같아야 합니다.
            const sellerBalanceAfterCancel = await token.balanceOf(seller.address);
            expect(sellerBalanceAfterCancel).to.equal(sellerInitialBalance);

            // 기록이 제거되었는지 확인
            const record = await token.sellRecord(sellId);
            expect(record.depositState).to.be.false;
        });

        it("유효하지 않은 서명으로 예치 취소를 시도하면 실패해야 한다", async function() {
            // 1. 유효한 예치 상태 설정
            const sellId = `CANCEL-INVALID-${Date.now()}`;
            const seller = otherAccount;
            const tokenAmount = 100;
            const decimals = await token.decimals();
            const amountWei = BigInt(tokenAmount) * (10n ** decimals);
            const deadline = Math.floor(Date.now() / 1000) + 3600;

            await token.transferTokensFromContract(seller.address, amountWei);
            const nonce = await token.nonces(seller.address);
            const value = amountWei;
            const domain = { name: await token.name(), version: "1", chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await token.getAddress() };
            const types = { Permit: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] };
            const permitMessage = { owner: seller.address, spender: await token.getAddress(), value: value, nonce: nonce, deadline: deadline };
            const signature = await otherAccount.signTypedData(domain, types, permitMessage);
            const { v, r, s } = ethers.Signature.from(signature);
            await token.depositWithPermit(sellId, seller.address, tokenAmount, deadline, v, r, s);
            
            // 2. 다른 계정(deployer)의 서명으로 예치 취소 시도
            const invalidSigner = deployer; // 서명자가 아닌 다른 계정
            const messageHash = ethers.solidityPackedKeccak256(
                ["string", "address", "uint256"],
                [sellId, seller.address, BigInt(tokenAmount)]
            );
            const { v: v2, r: r2, s: s2 } = ethers.Signature.from(await invalidSigner.signMessage(ethers.getBytes(messageHash)));

            // 3. 잘못된 서명으로 함수 호출 -> "Signer is not the provided seller address." 에러 발생 예상
            await expect(token.cancelDeposit(
                sellId,
                seller.address,
                tokenAmount,
                messageHash,
                v2,
                r2,
                s2
            )).to.be.revertedWith("Signer is not the provided seller address.");

            // 4. 상태가 변경되지 않았는지 확인
            const record = await token.sellRecord(sellId);
            expect(record.depositState).to.be.true;
        });
    });
});