// deploy/deploy.js
const { network, ethers, run } = require("hardhat");
require("dotenv").config();
const fs = require("fs");

const router = process.env.SEPOLIA_FUNCTIONS_ROUTER;
const subscriptionId = BigInt(process.env.CHAINLINK_FUNCTIONS_SUBSCRIPTIONS);
const donId = process.env.SEPOLIA_DON_ID;
const trustedForwarder = process.env.GELATO_TRUSTED_FORWARDER;

// 자바스크립트 파일 읽기
const investmentSourceCode = fs.readFileSync("./request_api/investment_source.js", "utf8");
const tradeSourceCode = fs.readFileSync("./request_api/trade_source.js", "utf8");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();
    const [deployerSigner] = await ethers.getSigners();

    const name = process.env.TOKEN_NAME;
    const symbol = process.env.TOKEN_SYMBOL;
    const totalGoalAmount = process.env.TOTAL_GOAL_AMOUNT;
    const minAmount = process.env.MIN_AMOUNT;

    if (!name || !symbol || !totalGoalAmount || !minAmount) {
        throw new Error("Missing required environment variables: TOKEN_NAME, TOKEN_SYMBOL, TOTAL_GOAL_AMOUNT, MIN_AMOUNT.");
    }
    
    const totalGoalAmountBigInt = BigInt(totalGoalAmount);
    const minAmountBigInt = BigInt(minAmount);

    log("----------------------------------------------------");    
    log("Deploying FractionalInvestmentToken (Off-chain Integration Model) and waiting for confirmations...");

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
        from: deployer,
        args: args,
        log: true,
        waitConfirmations: network.config.blockConfirmations || 5,
    });

    log(`FractionalInvestmentToken deployed to ${token.address}`);
    log(`Constructor Arguments: ${args}`);
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
