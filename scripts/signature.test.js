require("dotenv").config();

const ethers = require("ethers");
const privateKey = process.env.PRIVATE_KEY_USER1;
const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(privateKey, provider);

const responseData = {
    "code": "OK",
    "message": "요청이 성공하였습니다.",
    "data": {
        "domain": {
            "name": "Local Test Fractional Investment Token",
            "version": "1",
            "chainId": 11155111,
            "verifyingContract": "0xa22921162B0283db90679E2d0dC7aB82A9cDA86e"
        },
        "message": {
            "owner": "0xBEe09296623Dee35Ae2570De33B6ba017bc2d4d9",
            "spender": "0xa22921162B0283db90679E2d0dC7aB82A9cDA86e",
            "value": 10000000000000000000,
            "nonce": 1,
            "deadline": 1756372863
        },
        "types": {
            "Permit": [
                {
                    "name": "owner",
                    "type": "address"
                },
                {
                    "name": "spender",
                    "type": "address"
                },
                {
                    "name": "value",
                    "type": "uint256"
                },
                {
                    "name": "nonce",
                    "type": "uint256"
                },
                {
                    "name": "deadline",
                    "type": "uint256"
                }
            ]
        }
    }
};

async function signData() {
    try {
        const messageForSigning = { ...responseData.data.message };
        messageForSigning.value = BigInt(responseData.data.message.value);

        const signature = await wallet.signTypedData(
            responseData.data.domain,
            responseData.data.types,
            messageForSigning
        );

        const { v, r, s } = ethers.Signature.from(signature);

        // 요청된 JSON 형식의 로그를 생성
        const outputLog = {
            smartContractAddress: responseData.data.domain.verifyingContract,
            sellId: "입력하시오",
            sellerAddress: responseData.data.message.owner,
            tokenAmount: responseData.data.message.value / (10 ** 18),
            deadline: responseData.data.message.deadline,
            v: v,
            r: r,
            s: s
        };

        console.log(JSON.stringify(outputLog, null, 4));

    } catch (error) {
        console.error("서명 중 오류 발생:", error);
    }
}

async function signCancelDeposit(sellId, sellerAddress, amount) {
    try {
        // 1. 필요한 데이터를 조합하여 해시 메시지 생성
        // 이 로직은 스마트 컨트랙트의 keccak256(abi.encodePacked(...))와 정확히 일치해야 합니다.
        const hashedMessage = ethers.solidityPackedKeccak256(
            ["string", "address", "uint256"],
            [sellId, sellerAddress, amount]
        );

        // 3. 해시 메시지를 서명
        // signMessage는 자동으로 이더리움 표준 접두사를 추가합니다.
        const signature = await wallet.signMessage(ethers.getBytes(hashedMessage));

        // 4. 서명에서 r, v, s 값 추출
        const { r, s, v } = ethers.Signature.from(signature);

        const outputLog = {
            hashedMessage: hashedMessage,
            signature: signature,
            r: r,
            s: s,
            v: v
        };

        console.log(JSON.stringify(outputLog, null, 4));

    } catch (error) {
        console.error("서명 중 오류 발생:", error);
        throw error;
    }
}


signData();

signCancelDeposit("23634", "0xBEe09296623Dee35Ae2570De33B6ba017bc2d4d9", 10);