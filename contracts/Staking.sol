// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract Staking is ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    bool public active;
    uint128 public startTime;
    uint128 public endTime;
    uint128 public duration;

    constructor(string memory _name, string memory _symbol) ERC721(_name, _symbol) {}

    function activate(uint128 _start, uint128 _end) external onlyOwner {
        require(_end > _start, 'err-start-end');
        startTime = _start;
        endTime = _end;
        duration = endTime - startTime;
        active = true;
    }
   
    function disable() external onlyOwner {
        require(active, 'err-not-active');
        active = false;
    }

    // function mint(address owner) public returns (uint256)
    // {
    //     uint256 newItemId = _tokenIds.current();
    //     _mint(owner, newItemId);

    //     _tokenIds.increment();
    //     return newItemId;
    // }

    // function burn(uint256 tokenId) public {
    //     _burn(tokenId);
    // }

    modifier isAuthorizedForToken(uint256 tokenId) {
        require(_isApprovedOrOwner(msg.sender, tokenId), 'Not approved');
        _;
    }
}
