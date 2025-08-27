function abiEncodeArray(uint256Array) {
    // ABI 인코딩 규칙에 따라 배열의 길이를 먼저 인코딩
    const length = uint256Array.length;
    const encodedLength = Functions.encodeUint256(length);

    // 각 요소를 인코딩하여 결합
    let encodedPayload = encodedLength;
    for (let i = 0; i < length; i++) {
        encodedPayload += Functions.encodeUint256(uint256Array[i]);
    }

    return encodedPayload;
}

const investmentsData = args;

const investmentsList = investmentsData.map(dataString => {
    const parts = dataString.split(',');
    
    return {
        investmentId: parts[0],
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
    throw Error("Request failed");
}

const { data } = apiResponse;

// API에서 반환된 Boolean 배열
const booleanResults = data.data.result;

const uint256Results = booleanResults.map(b => b ? 1 : 0);

return abiEncodeArray(uint256Results);
