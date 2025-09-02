const tradeId = args[0];
const buyId = args[1];
const sellId = args[2];
const tradeAmount = args[3];

const apiURL = "API_URL_PLACEHOLDER";

const apiResponse = await Functions.makeHttpRequest({
    url: apiURL, 
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    data: {
        tradeId : Number(tradeId) || 0,
        buyId : Number(buyId) || 0,
        sellId : Number(sellId) || 0,
        tradeAmount : Number(tradeAmount) || 0
    }
});

if (apiResponse.error) {
    console.error(apiResponse.error);
    throw Error(`Request failed : ${apiResponse.error}`);
}

const { data } = apiResponse;

const result = data.data.result === true ? 1 : 0;

return Functions.encodeUint256(result);
