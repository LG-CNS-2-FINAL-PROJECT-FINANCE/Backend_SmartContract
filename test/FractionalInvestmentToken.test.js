// test/FractionalInvestmentToken.test.js

const { expect } = require("chai");
const { ethers } = require("hardhat");
require("dotenv").config();

describe("FractionalInvestmentToken (Local Tests with Admin Key)", function () {
    let token;
    let deployer;
    let trustedForwarder;
    let router;
    let subscriptionId;
    let donId;
    let projectId;
    let name;
    let symbol;
    let totalGoalAmount;
    let minAmount;

    // 테스트 환경을 설정
    beforeEach(async function () {
        [deployer] = await ethers.getSigners();
        
        // Mocking for Chainlink & Gelato
        trustedForwarder = process.env.GELATO_TRUSTED_FORWARDER;
        router = process.env.SEPOLIA_FUNCTIONS_ROUTER;
        subscriptionId = BigInt(process.env.CHAINLINK_FUNCTIONS_SUBSCRIPTIONS);
        donId = process.env.SEPOLIA_DON_ID;

        // JavaScript 소스 코드 모의
        const investmentSourceCode = "return Functions.encodeUint256(1);";
        const tradeSourceCode = "return Functions.encodeUint256(1);";

        projectId = ethers.encodeBytes32String(process.env.PROJECT_ID);
        name = process.env.TOKEN_NAME;
        symbol = process.env.TOKEN_SYMBOL;
        totalGoalAmount = process.env.TOTAL_GOAL_AMOUNT;
        minAmount = process.env.MIN_AMOUNT;

        const FractionalInvestmentToken = await ethers.getContractFactory("FractionalInvestmentToken");
        token = await FractionalInvestmentToken.deploy(
            projectId,
            name,
            symbol,
            totalGoalAmount,
            minAmount,
            trustedForwarder,
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
});
