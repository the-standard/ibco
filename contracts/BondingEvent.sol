//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "contracts/uniswap/INonfungiblePositionManager.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract BondingEvent is AccessControl {
	// sEUR: the main leg of the currency pair
	address public immutable sEuroToken;
	// other: the other generic erc20 compatible token
	address public immutable otherToken;

	struct TokenMetaData {
		bool initialised;
		address pool; //TODO: clarify relation between pool address and tokenId (NFT)
		string shortName;
		PositionMetaData[] positions; // store the data received after each successful bond
	}

	// allow quick lookup to see liquidity provided by users
	mapping(address => TokenMetaData) private userData;
	// liquidity pool for a currency pair (sEURO : someToken)
	address[] public liquidityPools;
	// minimum currency amount
	uint256 public immutable MIN_VAL = 0;

	// uniswap: creates bond
	INonfungiblePositionManager private immutable manager;
	IQuoter public constant quoter = IQuoter(0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6);

	// https://docs.uniswap.org/protocol/reference/core/libraries/Tick
	int24 public tickSpacing;
	int24 private constant TICK_LOWER = -887270;
	int24 private constant TICK_UPPER = 887270;
	uint24 private fee; // should the fee really be private?

	// only contract owner can add the other currency leg
	bytes32 public constant WHITELIST_GUARD = keccak256("WHITELIST_GUARD");

	constructor(address _sEuro, address _otherToken, address _manager) {
		_setupRole(WHITELIST_GUARD, msg.sender);
		sEuroToken = _sEuro;
		otherToken = _otherToken;
		manager = INonfungiblePositionManager(_manager);
	}

	// Adds a new ERC20-token to the list of allowed currency legs
	function newAllowedErc20(address _token, string memory _name, address _poolAddress) private {
		require(hasRole(WHITELIST_GUARD, msg.sender), 'invalid-whitelist-guard');
		require(userData[_token].initialised == false, 'token-already-added');

		userData[_token].initialised = true;
		userData[_token].shortName = _name;
		userData[_token].pool = _poolAddress;
	}


	// Compares the Standard Euro token to another token and returns them in ascending order
	function getAscendingPair(address _otherToken) private view returns (address token0, address token1) {
		(token0, token1) = sEuroToken < _otherToken
			? (sEuroToken, _otherToken)
			: (_otherToken, sEuroToken);
	}

	// Returns the amount of pools created
	function getPoolAmount() external view returns (uint256) {
		return liquidityPools.length;
	}

	// Initialises a pool with another token (address) and stores it in the array of pools.
	// Note that the price is in sqrtPriceX96 format.
	function initialisePool(string memory _otherName, address _otherAddress, uint160 _price, uint24 _fee) external {
		(address token0, address token1) = getAscendingPair(_otherAddress);
		fee = _fee;
		address pool = manager.createAndInitializePoolIfNecessary(
			token0,
			token1,
			_fee,
			_price
		);
		tickSpacing = IUniswapV3Pool(pool).tickSpacing();
		liquidityPools.push(pool);
		newAllowedErc20(_otherAddress, _otherName, pool);
	}

	function validTicks() private view returns (bool) {
		return TICK_LOWER % tickSpacing == 0 && TICK_UPPER % tickSpacing == 0;
	}

	struct PositionMetaData {
		uint256 tokenId;
		uint128 liquidity;
		uint256 amount0;
		uint256 amount1;
	}

	function addLiquidity(uint256 _amountSeuro, uint256 _amountOther, address _otherToken) private {
		// send sEURO tokens from the sender's account to the contract account
		TransferHelper.safeTransferFrom(sEuroToken, msg.sender, address(this), _amountSeuro);
		// send other erc20 tokens from the sender's account to the contract account
		TransferHelper.safeTransferFrom(_otherToken, msg.sender, address(this), _amountOther);
		// approve the contract to send sEURO tokens to manager
		TransferHelper.safeApprove(sEuroToken, address(manager), _amountSeuro);
		// approve the contract to send other erc20 tokens to manager
		TransferHelper.safeApprove(_otherToken, address(manager), _amountOther);

		(address token0, address token1) = getAscendingPair(_otherToken);

		// not sure why the full amount of seuro can't be added
		// possible explanation: the price moves so we need some margin, see link below:
		// https://github.com/Uniswap/v3-periphery/blob/main/contracts/NonfungiblePositionManager.sol#L273-L275=
		uint256 minSeuro = _amountSeuro - 0.05 ether;
		(uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min) =
			token0 == sEuroToken ?
			(_amountSeuro, _amountOther, minSeuro, MIN_VAL) :
			(_amountOther, _amountSeuro, MIN_VAL, minSeuro);

		INonfungiblePositionManager.MintParams memory params =
			INonfungiblePositionManager.MintParams({
			token0: token0,
			token1: token1,
			fee: fee,
			tickLower: TICK_LOWER,
			tickUpper: TICK_UPPER,
			amount0Desired: amount0Desired,
			amount1Desired: amount1Desired,
			amount0Min: amount0Min,
			amount1Min: amount1Min,
			recipient: address(this),
			deadline: block.timestamp
		});

		// provide liquidity to the pool
		(uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) = manager.mint(params);
		PositionMetaData memory pos = PositionMetaData(tokenId, liquidity, amount0, amount1);
		address tkn = _otherToken;
		userData[tkn].positions.push(pos);
	}

	function bond(uint256 _amountSeuro, address _otherToken, uint256 _amountOther) public {
		require(userData[_otherToken].initialised == true, 'invalid-token-bond');
		require(validTicks(), 'err-inv-tick');

		addLiquidity(_amountSeuro, _amountOther, _otherToken);

		//TODO: look into the refund mechanism again if needed, seems to work fine as of now.
	}
}
