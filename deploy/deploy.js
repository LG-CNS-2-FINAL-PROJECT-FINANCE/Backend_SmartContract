// deploy/deploy.js
const { network, ethers, run } = require("hardhat");
require("dotenv").config();
const fs = require("fs");
const path = require("path");

const router = process.env.SEPOLIA_FUNCTIONS_ROUTER;
const subscriptionId = BigInt(process.env.CHAINLINK_FUNCTIONS_SUBSCRIPTIONS);
const donId = process.env.SEPOLIA_DON_ID;
const trustedForwarder = process.env.GELATO_TRUSTED_FORWARDER;

const investmentApiUrl = process.env.INVESTMENT_API_URL;
const tradeApiUrl = process.env.TRADE_API_URL;

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
