// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
// import "hardhat/console.sol";

contract Staking is ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    bool public active;
    uint256 public startTime;
    uint256 public endTime;
    uint256 public initialised;
    uint256 public TOTAL_SEURO;
    uint public SEUROTST;
    uint256 private minTST;

    address TST_ADDRESS;

    mapping(address => Position) private _positions;

    struct Position {
        uint96 nonce;
        uint256 tokenId;
        bool open;
        uint256 totalValue;
    }

    constructor(string memory _name, string memory _symbol) ERC721(_name, _symbol) {}

    function activate(
        uint256 _start, 
        uint256 _end, 
        address _TST_ADDRESS,
        uint256 _TOTAL_SEURO,
        uint _SEUROTST
    ) external onlyOwner {

        // CHORE needs refactor
        require(active == false, 'err-already-active');
        require(initialised == 0, 'err-already-initialised');
        require(_end > _start, 'err-start-end');
        require(_end >= block.timestamp, 'err-invalid-end');

        TOTAL_SEURO = _TOTAL_SEURO;
        SEUROTST = _SEUROTST;
        TST_ADDRESS = _TST_ADDRESS;
        startTime = _start;
        endTime = _end;
        initialised = block.timestamp;

        // TODO variable
        minTST = 1 ether;

        active = true;
    }

    function disable() external onlyOwner {
        require(active, 'err-not-active');
        active = false;
    }

    function mint(uint256 _amount) external returns(uint256) {

        // TODO CHORE needs refactor
        require(active == true, 'err-not-active');
        require(_amount >= minTST, 'err-not-min');
        require(block.timestamp >= startTime, 'err-not-started');
        require(block.timestamp < endTime, 'err-finished');
        require(active == true, 'err-not-active');

        // TODO checks the total SEURO supply

        // Transfer funds from sender to this contract
        // TODO send to some other guy

        IERC20 TOKEN = IERC20(TST_ADDRESS);
        TOKEN.transferFrom(msg.sender, address(this), _amount);

        // fetch current tokenID
        uint256 newItemId = _tokenIds.current();

        Position memory position = _positions[msg.sender];

        if (position.nonce > 0) {
            position.totalValue += _amount;
            position.nonce += 1;
        }

        if (position.nonce == 0) {
            _mint(msg.sender, newItemId);

            position.nonce = 1;
            position.open = true;
            position.totalValue = _amount;
            position.tokenId = newItemId;
        

            // increment tokenIds for next steaker.
            _tokenIds.increment();
        }

        _positions[msg.sender] = position;

        // makes no sence to return this.
        return newItemId;
    }

    // function burn(uint256 tokenId) public {
    //     _burn(tokenId);
    // }

    function position(address owner) external view returns (uint96, uint256, bool, uint256) {
        Position memory position = _positions[owner];
        return (
            position.nonce, 
            position.tokenId, 
            position.open, 
            position.totalValue
        );
    }

    modifier isAuthorizedForToken(uint256 tokenId) {
        require(_isApprovedOrOwner(msg.sender, tokenId), 'Not approved');
        _;
    }
}
