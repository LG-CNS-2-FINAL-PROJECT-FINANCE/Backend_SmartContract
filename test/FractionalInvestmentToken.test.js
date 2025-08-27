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
            // ERC20 토큰의 총 발행량은 totalTokenAmount와 decimals를 기반으로 계산
            const expectedTotalSupply = totalTokens * (10n ** decimals);

            expect(totalSupply).to.equal(expectedTotalSupply);
            expect(await token.balanceOf(await token.getAddress())).to.equal(expectedTotalSupply);
        });
    });
    
    // --- 추가된 관리 기능 테스트 ---
    describe("Management Functions", function () {
        it("관리자만 컨트랙트를 일시 중지/재개할 수 있어야 한다", async function () {
            // 관리자(deployer)가 pause 호출 -> 성공
            await token.pause();
            expect(await token.paused()).to.be.true;

            // 관리자(deployer)가 unpause 호출 -> 성공
            await token.unpause();
            expect(await token.paused()).to.be.false;
        });

        it("토큰 락업 기간이 올바르게 설정되어야 한다", async function () {
            const now = (await ethers.provider.getBlock("latest")).timestamp;
            const unlockTime = now + 1000;

            // 관리자(deployer)가 락업 기간 설정 -> 성공
            await token.setLockup(deployer.address, unlockTime);
            
            // 락업 기간 중에는 전송이 불가능해야 함
            // deployer에게 토큰을 전송
            await token.transferTokensFromContract(deployer.address, 100);
            expect(await token.balanceOf(deployer.address)).to.equal(100);

            // 락업 기간이 아직 끝나지 않았으므로 전송 실패
            await expect(token.connect(deployer).transfer(deployer.address, 10)).to.be.revertedWith("Tokens are locked for this account.");
        });

        it("(투자) 컨트랙트 일시 중지인 경우, 토큰 전송이 불가해야 한다", async function () {
            // 컨트랙트 일시 중지
            await token.pause();

            // 일시 중지된 상태에서 전송 시도 -> Pausable 에러로 실패해야 함
            await expect(token.transferTokensFromContract(deployer.address, 100)).to.be.revertedWith("Tokens are Paused on this contract.");
            expect(await token.balanceOf(deployer.address)).to.equal(0);
            
            // 테스트 후 상태를 원래대로 되돌립니다.
            await token.unpause();
        });

        it("(거래) 컨트랙트 일시 중지인 경우, 토큰 전송이 불가해야 한다", async function () {
            // 일시 중지된 상태에서 전송 시도 -> Pausable 에러로 실패해야 함
            await token.transferTokensFromContract(deployer.address, 100);
            expect(await token.balanceOf(deployer.address)).to.equal(100);

            // 컨트랙트 일시 중지
            await token.pause();

            await expect(token.connect(deployer).transfer(await token.getAddress(), 10)).to.be.revertedWith("Tokens are Paused on this contract.");
            expect(await token.balanceOf(deployer.address)).to.equal(100);
            
            // 테스트 후 상태를 원래대로 되돌립니다.
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
            
            // `requestInvestment` 호출
            const tx = await token.requestInvestment(investments);
            const receipt = await tx.wait();

            // `InvestmentRequested` 이벤트에서 `reqId` 추출
            const event = receipt.logs.find(log => log.fragment && log.fragment.name === "InvestmentRequested");
            const reqId = event.args[1];
            
            // 모킹된 Chainlink 응답을 인코딩 (성공)
            const successResponse = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [1]);
            
            // `mockRouter`를 통해 `fulfillRequest` 호출 및 이벤트 확인
            await expect(mockRouter.fulfillRequest(reqId, successResponse, "0x"))
                .to.emit(token, "InvestmentSuccessful");

            // 최종 잔액 확인
            expect(await token.balanceOf(otherAccount.address)).to.equal(amountWei);
        });

        it("`requestInvestment`가 10명의 다수 투자를 성공적으로 처리해야 한다", async function () {
            const investments = [];
            const initialAmount = 10; // 첫 번째 투자자의 토큰 양
            let totalTokenAmount = 0;
            
            // 10명의 투자자 데이터 생성
            for (let i = 0; i < 10; i++) {
                const tokenAmount = initialAmount + i * 10; // 100, 110, 120...
                const investorAddress = deployer; // 간단한 테스트를 위해 동일 계정 사용
                
                investments.push({
                    investId: `INV-${Date.now()}-multi-${i}`,
                    investmentor: investorAddress.address,
                    tokenAmount: tokenAmount,
                    processState: false
                });
                
                totalTokenAmount += tokenAmount;
            }

            const totalAmountWei = BigInt(totalTokenAmount) * (10n ** (await token.decimals()));
            
            // `requestInvestment` 호출
            const tx = await token.requestInvestment(investments);
            const receipt = await tx.wait();

            // `InvestmentRequested` 이벤트에서 `reqId` 추출
            const event = receipt.logs.find(log => log.fragment && log.fragment.name === "InvestmentRequested");
            const reqId = event.args[1];

            // 모킹된 Chainlink 응답을 인코딩 (성공)
            const successResponse = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [1]);

            // `mockRouter`를 통해 `fulfillRequest` 호출
            await expect(mockRouter.fulfillRequest(reqId, successResponse, "0x"))
                .to.emit(token, "InvestmentSuccessful");

            // 최종 잔액 확인 (모든 토큰이 한 계정으로 분배됨)
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

            await token.transferTokensFromContract(seller.address, amountWei);

            const nonce = await token.nonces(seller.address);
            const value = amountWei;
            const domain = { name: await token.name(), version: "1", chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await token.getAddress() };
            const types = { Permit: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] };
            const permitMessage = { owner: seller.address, spender: await token.getAddress(), value: value, nonce: nonce, deadline: deadline };
            const signature = await otherAccount.signTypedData(domain, types, permitMessage);
            const { v, r, s } = ethers.Signature.from(signature);

            await token.depositWithPermit(sellId, seller.address, tokenAmount, deadline, v, r, s);
            
            // `requestTrade` 호출 및 `requestId` 추출
            const tx = await token.requestTrade(tradeId, sellId, seller.address, tokenAmount, buyId, buyer.address, tokenAmount);
            const receipt = await tx.wait();

            // `TradeRequested` 이벤트에서 `reqId` 추출
            const event = receipt.logs.find(log => log.fragment && log.fragment.name === "TradeRequested");
            const reqId = event.args[2];

            // 모킹된 Chainlink 응답을 인코딩
            const successResponse = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [1]);

            // `mockRouter`를 통해 `fulfillRequest`를 호출하고, `token` 컨트랙트에서 이벤트가 발생하는지 확인
            await expect(mockRouter.fulfillRequest(reqId, successResponse, "0x"))
                .to.emit(token, "TradeSuccessful")
                .withArgs(projectId, tradeId, reqId, projectId, tradeId, otherAccount.address, deployer.address, tokenAmount, "Off-chain purchase verified");

            expect(await token.balanceOf(deployer.address)).to.equal(amountWei);
        });
    });
});