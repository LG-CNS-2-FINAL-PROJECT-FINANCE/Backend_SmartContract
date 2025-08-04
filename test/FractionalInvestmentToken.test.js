// test/FractionalInvestmentToken.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");
require("dotenv").config();

describe("FractionalInvestmentToken (Local Tests)", function () {
    let token;
    let deployer;
    let user1;
    let user2;
    let trustedForwarder;
    let router;
    let subscriptionId;
    let donId;

    // 테스트 환경을 설정
    beforeEach(async function () {
        [deployer, user1, user2] = await ethers.getSigners();
        
        // Mocking for Chainlink & Gelato
        trustedForwarder = process.env.GELATO_TRUSTED_FORWARDER; // 테스트를 위해 deployer 주소를 사용
        router = process.env.SEPOLIA_FUNCTIONS_ROUTER;
        subscriptionId = BigInt(process.env.CHAINLINK_FUNCTIONS_SUBSCRIPTIONS);
        donId = process.env.SEPOLIA_DON_ID;

        // JavaScript 소스 코드 모의
        const investmentSourceCode = "return Functions.encodeUint256(1);";
        const tradeSourceCode = "return Functions.encodeUint256(1);";

        const FractionalInvestmentToken = await ethers.getContractFactory("FractionalInvestmentToken");
        
        // 컨트랙트 배포
        token = await FractionalInvestmentToken.deploy(
            "Test Fractional Investment Token",
            "TFIT",
            100_000_000,
            10_000,
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
            expect(await token.name()).to.equal("Test Fractional Investment Token");
            expect(await token.symbol()).to.equal("TFIT");
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
        it("소유자만 컨트랙트를 일시 중지/재개할 수 있어야 한다", async function () {
            await expect(token.connect(user1).pause()).to.be.revertedWith("Ownable: caller is not the owner");
            await token.pause();
            expect(await token.paused()).to.be.true;

            await expect(token.connect(user1).unpause()).to.be.revertedWith("Ownable: caller is not the owner");
            await token.unpause();
            expect(await token.paused()).to.be.false;
        });

        it("소유자만 투자 기간을 설정할 수 있어야 한다", async function () {
            const now = (await ethers.provider.getBlock("latest")).timestamp;
            const startTime = now + 100;
            const endTime = now + 200;

            await expect(token.connect(user1).setInvestmentPeriod(startTime, endTime)).to.be.revertedWith("Ownable: caller is not the owner");
            await token.setInvestmentPeriod(startTime, endTime);
            
            expect(await token.investmentStartTime()).to.equal(startTime);
            expect(await token.investmentEndTime()).to.equal(endTime);
        });

        it("토큰 락업 기간이 올바르게 설정되어야 한다", async function () {
            const now = (await ethers.provider.getBlock("latest")).timestamp;
            const unlockTime = now + 1000;

            await expect(token.connect(user1).setLockup(user1.address, unlockTime)).to.be.revertedWith("Ownable: caller is not the owner");
            await token.setLockup(user1.address, unlockTime);
            
            // 락업 기간 중에는 전송이 불가능해야 함
            // 먼저 토큰을 user1에게 전송
            await token.transferTokensFromContract(user1.address, 100);
            expect(await token.balanceOf(user1.address)).to.equal(100);

            // 락업 기간이 아직 끝나지 않았으므로 전송 실패
            await expect(token.connect(user1).transfer(user2.address, 10)).to.be.revertedWith("Tokens are locked for this account.");
        });
    });
});
