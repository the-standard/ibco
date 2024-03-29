# Stage 1 APIs

The sEURO offering is the first stage in the IBCO process. Users can obtain sEURO in exchange for ETH or some accepted ERC20 tokens, at a discount which gradually reaches full price during the period of the IBCO.

### sEURO Offering Public APIs

These are the functions exposed to the user in the sEURO Offering contract. This contract can be used to estimate a price for a given token, and perform a swap.

**readOnlyCalculateSwap(bytes32 _token, uint256 _amount)**

*Description*: estimates a price for given amount of given token

*Input*: symbol of accepted token as a 32-byte array (provided by **TokenManager**); amount of provided token to estimate conversion into sEURO

*Output*: an estimate in sEURO given the input

**swap(bytes32 _token, uint256 _amount)**

*Description*: swaps the given amount of given token for equivalent sEURO, transferred to user; user must approve **SEuroOffering** contract for given amount of token

*Input*: symbol of accepted token as a 32-byte array (provided by **TokenManager**); amount of provided token to swap into sEURO

**swapETH()**

*Description*: payable function that swaps ETH value of message for equivalent sEURO

### Token Manager Public APIs

These are the functions exposed to the user in the Token Manager contract. This contract can be used to retrieve all accepted tokens for the sEURO Offering, and obtain the details for each token.

getAcceptedTokens(): returns an array of all the accepted token symbols, e.g., ["WETH", "USDT", "USDC"]

getTokenDecimalFor(string symbol): returns the decimals for the token symbol, e.g. 18 for WETH

getTokenAddressFor(string symbol): returns the deployed contract address for the token


# Stage 1 Architecture

### Contracts
The contracts used in this stage are:

- [SEuroOffering.sol](../../contracts/SEuroOffering.sol): exposes the API for obtaining sEURO by exchanging ETH or some ERC20 tokens
- [TokenManager.sol](../../contracts/TokenManager.sol): dictates which ERC20 tokens are accepted to exchange for sEURO, and stores exchange rate details
- [SEuroCalculator.sol](../../contracts/SEuroCalculator.sol): calculates how many sEURO to exchange for the given collateral
- [BondingCurve.sol](../../contracts/BondingCurve.sol): calculates the current price of sEURO in euros
- [SEuro.sol](../../contracts/SEuro.sol): the ERC20-token representing the stable euro

### Relationship
The relationship between the contracts is:
1. **SEuroOffering** gets the exchange rate contracts from **TokenManager** and uses **SEuroCalculator** to calculate the exchange rate
2. **SEuroCalculator** calculates the base exchange rate of ETH/ERC20 to euros, then gets the amount of sEURO that can be obtained with given euros
3. **BondingCurve** exposes the main APIs
