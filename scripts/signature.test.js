require("dotenv").config();

const ethers = require("ethers");
const privateKey = process.env.PRIVATE_KEY_USER1;
const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(privateKey, provider);

const responseData = {
    "domain": {
        "name": "Local Test Fractional Investment Token",
        "version": "1",
        "chainId": 11155111,
        "verifyingContract": "0xabf49dfe465bb6dfa3c6bd31c84c232eab485b70"
    },
    "message": {
        "owner": "0xBEe09296623Dee35Ae2570De33B6ba017bc2d4d9",
        "spender": "0xabf49dfe465bb6dfa3c6bd31c84c232eab485b70",
        "value": 100000000000000000000, 
        "nonce": 0,
        "deadline": 1755667428
    },
    "types": {
        "Permit": [
            { "name": "owner", "type": "address" },
            { "name": "spender", "type": "address" },
            { "name": "value", "type": "uint256" },
            { "name": "nonce", "type": "uint256" },
            { "name": "deadline", "type": "uint256" }
        ]
    }
};

async function signData() {
    try {
        const messageForSigning = { ...responseData.message };
        messageForSigning.value = BigInt(responseData.message.value);

        const signature = await wallet.signTypedData(
            responseData.domain,
            responseData.types,
            messageForSigning
        );

        const { v, r, s } = ethers.Signature.from(signature);

        // 요청된 JSON 형식의 로그를 생성
        const outputLog = {
            smartContractAddress: responseData.domain.verifyingContract,
            sellId: "입력하시오",
            sellerAddress: responseData.message.owner,
            tokenAmount: responseData.message.value / (10 ** 18),
            deadline: responseData.message.deadline,
            v: v,
            r: r,
            s: s
        };

        console.log(JSON.stringify(outputLog, null, 4));

    } catch (error) {
        console.error("서명 중 오류 발생:", error);
    }
}

signData();