const { BigNumber } = require("ethers");

const generatePriceBuckets = (size, quantity) => {
    const INITIAL_PRICE = 8 * 10 ** 17;
    const FULL_PRICE = 10 ** 18;
    const MAX_SUPPLY = 200_000_000
    const K = FULL_PRICE - INITIAL_PRICE;
    const J = 0.2;

    const getPriceForToken = token => {
        return K * ((token / MAX_SUPPLY) ** J) + INITIAL_PRICE
    }

    const priceBuckets = [];
    for (let i = 0; i < quantity; i++) {
        priceBuckets.push(BigNumber.from(getPriceForToken(i * size + size / 2).toString()));
    }
    return priceBuckets;
}

module.exports = {
    generatePriceBuckets
}