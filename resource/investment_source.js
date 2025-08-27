const investmentsData = args;

const investmentsList = investmentsData.map(dataString => {
    const parts = dataString.split(',');
    
    return {
        investmentId: parts[0],
        investorAddress: parts[1],
        tokenAmount: parseInt(parts[2])
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

const result = data.data.result === true ? 1 : 0;

return Functions.encodeUint256(result);
