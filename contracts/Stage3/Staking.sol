// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "contracts/Pausable.sol";

contract Staking is ERC721, Ownable, Pausable {
    uint256 private _tokenId;

    bool public active;             // active or not, needs to be set manually
    bool public catastrophic;       // in the event of a catastrophy, let users withdraw

    uint256 public exchangeRate;        // SEURO:TST pair rate
    uint256 public windowStart;         // the start time for the 'stake'
    uint256 public windowEnd;           // the end time for the 'stake'
    uint256 public maturity;            // the maturity date
    uint256 public initialised;         // the time we initialised the contract
    uint256 public allocatedSeuro;     // the amount of seuro allocated, inc rewards

    address public immutable TST_ADDRESS;
    address public immutable SEURO_ADDRESS;
    uint256 public immutable SI_RATE; // simple interest rate for the bond
    uint256 public immutable minTST;  // the allowed minimum amount of TST to bond

    mapping(address => Position) private _positions;

    struct Position {
        uint96 nonce;
        uint256 tokenId;
        bool open;
        uint256 stake;
        uint256 reward;
    }

    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _start,
        uint256 _end,
        uint256 _maturity,
        address _TST_ADDRESS,
        address _SEURO_ADDRESS,
        uint256 _exchangeRate,
        uint256 _si
    ) ERC721(_name, _symbol) {
        exchangeRate = _rate;
        SI_RATE = _si;
        TST_ADDRESS = _TST_ADDRESS;
        SEURO_ADDRESS = _SEURO_ADDRESS;
        windowStart = _start;
        windowEnd = _end;
        maturity = _maturity;
        initialised = block.timestamp;
        minTST = 1 ether;
    }

    function activate() external onlyOwner {
        require(active == false, "err-already-active");
        active = true;
    }

    function disable() external onlyOwner {
        require(active, "err-not-active");
        active = false;
    }

    function setExchangeRate(uint256 _newRate) external onlyOwner {
        exchangeRate = _newRate;
    }

    // reward works out the amount of seuro given to the user based on the
    // amount of TST they first put in.
    function calculateReward(uint256 _amount) public view returns (uint256 reward) {
        uint256 rewardTST = (_amount * INTEREST) / 100_000;
        reward = (rewardTST * SEUROTST) / 100_000;
    }

    // fetches the balance of the contract for the give erc20 token
    function balance(address _address) public view returns (uint256) {
        IERC20 TOKEN = IERC20(_address);
        return TOKEN.balanceOf(address(this));
    }

    // fetches the remaining about of tokens in the contract
    function remaining(address _address) public view returns (uint256) {
        return balance(_address) - allocatedSeuro;
    }

    function mint(uint256 _stake) external ifNotPaused {
        require(active == true, "err-not-active");
        require(_stake >= minTST, "err-not-min");
        require(block.timestamp >= windowStart, "err-not-started");
        require(block.timestamp < windowEnd, "err-finished");

        // calculate the reward so we can also update the remaining SEURO
        uint256 reward = calculateReward(_stake);
        require(remaining(SEURO_ADDRESS) >= reward, "err-overlimit");

        // Transfer funds from sender to this contract
        // TODO send to some other guy not this contract!

        IERC20 TOKEN = IERC20(TST_ADDRESS);
        TOKEN.transferFrom(msg.sender, address(this), _stake);

        // fetch current tokenID
        uint256 newItemId = _tokenId;

        Position memory pos = _positions[msg.sender];

        if (pos.nonce == 0) {
            _mint(msg.sender, newItemId);

            pos.open = true;
            pos.tokenId = newItemId;

            _tokenId++;
        }

        // update the position
        pos.stake += _stake;
        pos.nonce += 1;
        pos.reward += reward;

        // update the position
        _positions[msg.sender] = pos;

        // update the remaining SEURO
        allocatedSeuro += reward;
    }

    function burn() public ifNotPaused {
        require(block.timestamp >= maturity, "err-maturity");

        Position memory pos = _positions[msg.sender];
        require(pos.nonce > 0, "err-not-valid");
        require(pos.open == true, "err-closed");

        // update position
        pos.open = false;

        // burn the token
        _burn(pos.tokenId);

        // transfer stake
        IERC20 TST = IERC20(TST_ADDRESS);
        TST.transfer(msg.sender, pos.stake);

        // transfer reward
        IERC20 SEURO = IERC20(SEURO_ADDRESS);
        SEURO.transfer(msg.sender, pos.reward);

        _positions[msg.sender] = pos;
    }

    // withdraw to the owner's address
    function withdraw(address _address) external onlyOwner {
        IERC20 TOKEN = IERC20(_address);
        uint256 bal = TOKEN.balanceOf(address(this));

        require(bal > 0, "err-no-funds");
        TOKEN.transfer(owner(), bal);
    }

    function position(address owner) external view returns (Position memory) {
        return _positions[owner];
    }

    function catastrophy() external onlyOwner {
        require(active == true, "err-already-active");
        require(catastrophic == false, "err-already-catastrophic");
        catastrophic = true;
        active = false;
    }

    function catastrophicClose() external {
        require(catastrophic == true, "err-not-allowed");

        Position memory pos = _positions[msg.sender];
        require(pos.nonce > 0, "err-no-position");
        require(pos.open == true, "err-postition-closed");

        IERC20 TOKEN = IERC20(TST_ADDRESS);
        TOKEN.transfer(msg.sender, pos.stake);

        // closed for business
        pos.open = false;

        // burn the token
        _burn(pos.tokenId);

        _positions[msg.sender] = pos;
    }
}
