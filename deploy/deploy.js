// deploy/deploy.js
const { network, ethers, run } = require("hardhat");
require("dotenv").config();
const fs = require("fs");
const path = require("path");

const router = process.env.SEPOLIA_FUNCTIONS_ROUTER;
const subscriptionId = BigInt(process.env.CHAINLINK_FUNCTIONS_SUBSCRIPTIONS);
const donId = process.env.SEPOLIA_DON_ID;
const trustedForwarder = process.env.GELATO_TRUSTED_FORWARDER;

// 환경 변수에서 API URL을 가져옵니다.
const investmentApiUrl = process.env.INVESTMENT_API_URL;
const tradeApiUrl = process.env.TRADE_API_URL;

// 자바스크립트 파일 읽기
const investmentSourceCodeTemplate = fs.readFileSync(path.join(__dirname, '../resource/investment_source.js'), 'utf8');
const tradeSourceCodeTemplate = fs.readFileSync(path.join(__dirname, '../resource/trade_source.js'), 'utf8');

module.exports = async ({ deployments }) => {
    const { deploy, log } = deployments;
    const [ deployer ] = await ethers.getSigners();

    const name = process.env.TOKEN_NAME;
    const symbol = process.env.TOKEN_SYMBOL;
    const totalGoalAmount = process.env.TOTAL_GOAL_AMOUNT;
    const minAmount = process.env.MIN_AMOUNT;

    if (!name || !symbol || !totalGoalAmount || !minAmount) {
        throw new Error(`Missing required environment variables: TOKEN_NAME=${name}, TOKEN_SYMBOL=${symbol}, TOTAL_GOAL_AMOUNT=${totalGoalAmount}, MIN_AMOUNT=${minAmount}.`);
    }
    
    const totalGoalAmountBigInt = BigInt(totalGoalAmount);
    const minAmountBigInt = BigInt(minAmount);

    log("----------------------------------------------------");     
    log("Deploying FractionalInvestmentToken (Off-chain Integration Model) and waiting for confirmations...");
    
    // 템플릿에 API URL을 주입하여 최종 소스코드를 생성합니다.
    const investmentSourceCode = investmentSourceCodeTemplate.replace('API_URL_PLACEHOLDER', investmentApiUrl);
    const tradeSourceCode = tradeSourceCodeTemplate.replace('API_URL_PLACEHOLDER', tradeApiUrl);

    const args = [
        name,
        symbol,
        totalGoalAmountBigInt,
        minAmountBigInt,
        trustedForwarder,
        router,
        subscriptionId,
        donId,
        investmentSourceCode,
        tradeSourceCode
    ];

    const token = await deploy("FractionalInvestmentToken", {
        from: deployer.address,
        args: args,
        log: true,
        waitConfirmations: network.config.blockConfirmations || 5,
    });

    log(`FractionalInvestmentToken deployed to ${token.address}`);
    
    // FunctionsSubscriptions 컨트랙트 인스턴스를 가져옵니다.
    const functionsSubscriptionsContract = await ethers.getContractAt("IFunctionsSubscriptions", router);

    // deployer 계정이 직접 addConsumer 함수를 호출합니다.
    log("Registering as Chainlink Functions consumer...");
    const addConsumerTx = await functionsSubscriptionsContract.connect(deployer).addConsumer(subscriptionId, token.address);
    await addConsumerTx.wait(network.config.blockConfirmations || 5);
    log(`Successfully registered consumer: ${token.address} for subscriptionId: ${subscriptionId}`);

    log("----------------------------------------------------");

    if (process.env.ETHERSCAN_API_KEY && network.config.chainId === 11155111) {
        log("Verifying on Etherscan...");
        await run("verify:verify", {
            address: token.address,
            constructorArguments: args,
        });
        log("Verified!");
    }
};

module.exports.tags = ["all", "token"];
