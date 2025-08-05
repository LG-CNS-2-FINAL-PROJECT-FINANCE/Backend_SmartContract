const tradeId = args[0];

const apiURL = "API_URL_PLACEHOLDER";

const apiResponse = await Functions.makeHttpRequest({
    url: `${apiURL}?id=${tradeId}`
});

if (apiResponse.error) {
    console.error(apiResponse.error);
    throw Error("Request failed");
}

const { data } = apiResponse;

const result = data.data.result === true ? 1 : 0;

return Functions.encodeUint256(result);
