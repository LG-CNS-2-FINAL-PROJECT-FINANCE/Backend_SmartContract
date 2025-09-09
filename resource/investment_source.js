const investmentsData = args;

const investmentsList = investmentsData.map(dataString => {
    const parts = dataString.split(',');
    
    return {
        investmentId: Number(parts[0]) || 0,
        investorAddress: parts[1],
        tokenAmount: Number(parts[2]) || 0
    };
});

const apiURL = "API_URL_PLACEHOLDER";

const apiResponse = await Functions.makeHttpRequest({
    url: apiURL, 
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    data: {
        investments: investmentsList 
    }
});

if (apiResponse.error) {
    console.error(apiResponse.error);
    throw Error(`Request failed : ${apiResponse.error}`);
}

const { data } = apiResponse;

// API에서 반환된 Boolean 배열
const booleanResults = data.data.result;

const uint256Results = booleanResults.map(b => b ? 1 : 0);

// npm 레지스트리에서 ethers 라이브러리를 가져옵니다.
const { ethers } = await import("npm:ethers@6.15.0");
const abiCoder = ethers.AbiCoder.defaultAbiCoder();

// abiCoder.encode의 결과물을 Uint8Array로 변환하여 반환
const encodedResult = abiCoder.encode(["uint256[]"], [uint256Results]);

// ethers.utils.arrayify는 ethers v5에서 사용
// ethers v6에서는 ethers.getBytes()를 사용합니다.
return ethers.getBytes(encodedResult);