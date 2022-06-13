//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "contracts/uniswap/INonfungiblePositionManager.sol";
import "contracts/BondStorage.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "abdk-libraries-solidity/ABDKMath64x64.sol";

contract BondingEvent is AccessControl, BondStorage {
	// sEUR: the main leg of the currency pair
	address public immutable sEuroToken;
	// other: the other ERC-20 token
	address public immutable otherToken;
	// bond storage contract
	address public bondStorage;

	struct TokenMetaData {
		bool initialised;
		address pool; // "Every pool is a unique instance of the UniswapV3Pool contract and is deployed
		              // at its own unique address" (see https://docs.uniswap.org/protocol/reference/deployments)
		string shortName;
	}

	// allow quick lookup to see liquidity provided by users
	TokenMetaData private tokenData;
	// minimum currency amount
	uint256 public immutable MIN_VAL = 0;

	// uniswap: creates bond
	INonfungiblePositionManager private immutable manager;

	// https://docs.uniswap.org/protocol/reference/core/libraries/Tick
	int24 public tickSpacing;
	int24 public tickLowerBound;
	int24 public tickHigherBound;
	uint24 fee;

	// Emitted when a user adds liquidity.
	event mintPosition(address user, uint256 nft, uint128 liquidity, uint256 amount0, uint256 amount1);

	// only contract owner can add the other currency leg
	bytes32 public constant WHITELIST_BONDING_EVENT = keccak256("WHITELIST_BONDING_EVENT");

	constructor(address _sEuro, address _otherToken, address _manager, address _bondStorage) {
		_setupRole(WHITELIST_BONDING_EVENT, msg.sender);
		sEuroToken = _sEuro;
		otherToken = _otherToken;
		bondStorage = _bondStorage;
		tickLowerBound = -10000;
		tickHigherBound = 10000;
		manager = INonfungiblePositionManager(_manager);
	}

	modifier onlyPoolOwner {
		require(hasRole(WHITELIST_BONDING_EVENT, msg.sender), "invalid-user");
		_;
	}

	modifier isNotInit {
		require(tokenData.initialised == false, 'token-already-init');
		_;
	}

	modifier isInit {
		require(tokenData.initialised == true, 'token-not-init');
		_;
	}

	modifier validTickSpacing {
		require(tickLowerBound % tickSpacing == 0 && tickHigherBound % tickSpacing == 0);
		_;
	}

	modifier validTickRange(int24 low, int24 high) {
		require(high <= 887270, "tick-max-exceeded");
		require(low >= -887270, "tick-min-exceeded");
		require(high != 0 && low != 0, "tick-val-zero");
		_;
	}

	function bootstrapTokenData(string memory _name, address _poolAddress) private {
		tokenData.initialised = true;
		tokenData.shortName = _name;
		tokenData.pool = _poolAddress;
	}

	function adjustTick(int24 newLower, int24 newHigher) public onlyPoolOwner isInit validTickRange(newLower, newHigher) {
		tickLowerBound = newLower;
		tickHigherBound = newHigher;
	}

	function getTickBounds() public view returns (int24[2] memory) {
		return [tickLowerBound, tickHigherBound];
	}

	// Compares the Standard Euro token to another token and returns them in ascending order
	function getAscendingPair(address _otherToken) private view returns (address token0, address token1) {
		(token0, token1) = sEuroToken < _otherToken
			? (sEuroToken, _otherToken)
			: (_otherToken, sEuroToken);
	}

	function isPoolInitialised() external view returns (bool) {
		return tokenData.initialised;
	}

	// Initialises a pool with another token (address) and stores it in the array of pools.
	// Note that the price is in sqrtPriceX96 format.
	function initialisePool(string memory _otherName, address _otherAddress, uint160 _price, uint24 _fee)
	external onlyPoolOwner isNotInit {
		(address token0, address token1) = getAscendingPair(_otherAddress);
		fee = _fee;
		address pool = manager.createAndInitializePoolIfNecessary(
			token0,
			token1,
			_fee,
			_price
		);
		tickSpacing = IUniswapV3Pool(pool).tickSpacing();
		bootstrapTokenData(_otherName, pool);
	}

	// Various of allowances to be able to create a liquidity position
	function mintPermissionsPrepare(
		address _sender,
		address _token0,
		address _token1,
		uint256 _amount0,
		uint256 _amount1,
		uint256 _amount0Desired,
		uint256 _amount1Desired
	) private {
		// approve the contract to send the tokens to manager
		TransferHelper.safeApprove(_token0, address(manager), _amount0Desired);
		TransferHelper.safeApprove(_token1, address(manager), _amount1Desired);

		// send the tokens from the sender's account to the contract account
		TransferHelper.safeTransferFrom(_token0, _sender, address(this), _amount0);
		TransferHelper.safeTransferFrom(_token1, _sender, address(this), _amount1);
	}


	struct LiquidityPair {
		uint256 amountSeuroU256;
		uint256 amountOtherU256;
		int128 amountSeuro128;
		int128 amountOther128;
		address other;
	}

	function addLiquidity(LiquidityPair memory pair) private returns (PositionMetaData memory) {
		(address token0, address token1) = getAscendingPair(pair.other);

		// The price moves so we need some margin, see link below:
		// https://github.com/Uniswap/v3-periphery/blob/main/contracts/NonfungiblePositionManager.sol#L273-L275
		int128 seuroMin128 = ABDKMath64x64.sub(pair.amountSeuro128, 10);
		uint256 minSeuro = uint256(ABDKMath64x64.toUInt(seuroMin128));

		(uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min) =
			token0 == sEuroToken ?
			(pair.amountSeuroU256, pair.amountOtherU256, minSeuro, MIN_VAL) :
			(pair.amountOtherU256, pair.amountSeuroU256, MIN_VAL, minSeuro);

		mintPermissionsPrepare(msg.sender, token0, token1, amount0Min, amount1Min, amount0Desired, amount1Desired);

		INonfungiblePositionManager.MintParams memory params =
			INonfungiblePositionManager.MintParams({
			token0: token0,
			token1: token1,
			fee: fee,
			tickLower: tickLowerBound,
			tickUpper: tickHigherBound,
			amount0Desired: amount0Desired,
			amount1Desired: amount1Desired,
			amount0Min: amount0Min,
			amount1Min: amount1Min,
			recipient: address(this),
			deadline: block.timestamp
		});

		// provide liquidity to the pool
		(uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) = manager.mint(params);
		emit mintPosition(msg.sender, tokenId, liquidity, amount0, amount1);
		
		// do a swap if amount0 contains the foreign token to keep sEURO first
		if (amount0 == pair.amountOtherU256) (amount0, amount1) = (amount1, amount0);
		PositionMetaData memory pos = PositionMetaData(tokenId, liquidity, /* sEURO field */ amount0, /* other field */ amount1);
		return pos;

		//TODO: look into the refund mechanism again if needed, create tests to make sure nothing is "lost"
	}

	// We assume that there is a higher layer solution which helps to fetch the latest price as a quote.
	// This quote is being used to supply the two amounts to the function.
	// The reason for this is because of the explicit discouragement of doing this on-chain
	// due to the high gas costs (see https://docs.uniswap.org/protocol/reference/periphery/lens/Quoter).
	/// @param _amountSeuro The amount of sEURO token to bond
	/// @param _amountOther The amount of the other token to bond
	/// @param _otherToken The address of the other token
	/// @param _maturityInWeeks The amount of months a bond is active.
	///                          At the end of maturity, the principal + accrued interest is paid out all at once in TST.
	/// @param _rate The rate is represented as a 10,000-factor of each basis point so the most stable fee is 500 (= 0.05 pc)
	function bond(
		int128 _amountSeuro,
		int128 _amountOther,
		address _otherToken,
		uint256 _maturityInWeeks,
		int128 _rate
	) public isInit validTickSpacing {
		uint256 seuro256 = uint256(ABDKMath64x64.toUInt(_amountSeuro));
		uint256 sother256 = uint256(ABDKMath64x64.toUInt(_amountOther));

		// to avoid stack to deep in AddLiquidity
		LiquidityPair memory pair = LiquidityPair(seuro256, sother256, _amountSeuro, _amountOther, _otherToken);

		// information about the liquidity position after it has been successfully added
		PositionMetaData memory position = addLiquidity(pair);
		// begin bonding event
		BondStorage.startBond(msg.sender, _amountSeuro, _rate, _maturityInWeeks, position);

	}

	function getAmountBonds(address _user) public view returns (int128) {
		return BondStorage.getActiveBonds(_user);
	}

	function getUserBonds(address _user) public view override returns (Bond[] memory) {
		return BondStorage.getUserBonds(_user);
	}

	function getUserBondAt(address _user, uint128 index) public view returns (Bond memory) {
		require(index <= getUserBonds(_user).length - 1, 'invalid-bond-index');

		return BondStorage.getBondAt(_user, index);
	}
}
