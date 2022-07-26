# sEURO Offering Architecture
The sEURO Offering is the first stage in the IBCO process. Users can obtain sEURO in exchange for ETH or some accepted ERC20 tokens, at a discount which gradually reaches full price during the period of the IBCO.


### Contracts
The contracts used in this stage are:

- [SEuroOffering.sol](../../contracts/SEuroOffering.sol): exposes the API for obtaining sEURO by exchanging ETH or some ERC20 tokens
- [TokenManager.sol](../../contracts/TokenManager.sol): dictates which ERC20 tokens are accepted to exchange for sEURO, and stores exchange rate details
- [SEuroCalculator.sol](../../contracts/SEuroCalculator.sol): calculates how many sEURO to exchange for the given collateral
- [BondingCurve.sol](../../contracts/BondingCurve.sol): calculates the current price of sEURO in euros

### Relationship
The relationship between the contracts is:
1. **SEuroOffering** gets the exchange rate contracts from **TokenManager** and uses **SEuroCalculator** to calculate the exchange rate
2. **SEuroCalculator** calculates the base exchange rate of ETH/ERC20 to euros, then gets the amount of sEURO that can be obtained with given euros