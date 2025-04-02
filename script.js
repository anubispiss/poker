document.addEventListener('DOMContentLoaded', () => {
    // --- Constants ---
    const SUITS = ["H", "D", "C", "S"]; // Hearts, Diamonds, Clubs, Spades
    const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
    const RANK_VALUES = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "T": 10, "J": 11, "Q": 12, "K": 13, "A": 14 };
    const HAND_RANKINGS = {
        HIGH_CARD: 0, PAIR: 1, TWO_PAIR: 2, THREE_OF_A_KIND: 3, STRAIGHT: 4,
        FLUSH: 5, FULL_HOUSE: 6, FOUR_OF_A_KIND: 7, STRAIGHT_FLUSH: 8, ROYAL_FLUSH: 9
    };
    const HAND_NAMES = ["High Card", "Pair", "Two Pair", "Three of a Kind", "Straight", "Flush", "Full House", "Four of a Kind", "Straight Flush", "Royal Flush"];
    const BET_AMOUNT = 10;
    const ANTE = 5;
    const STARTING_CREDITS = 100;


    // --- Game State Variables ---
    let deck = [];
    let playerHand = [];
    let botHand = [];
    let playerCredits = STARTING_CREDITS;
    let botCredits = STARTING_CREDITS;
    let pot = 0;
    let currentBet = 0; // Amount needed to call in current round
    let betTurn = 0; // 0: Initial deal, 1: After Draw
    let cardsToDiscard = []; // Indexes of player cards to discard

    // Game phases: START, DEALING, BETTING_1, DRAWING, BETTING_2, SHOWDOWN, GAME_OVER
    let gameState = 'START';


    // --- DOM Element References ---
    const playerCardsDiv = document.getElementById('player-cards');
    const botCardsDiv = document.getElementById('bot-cards');
    const messageDiv = document.getElementById('message');
    const potSpan = document.getElementById('pot');
    const playerCreditsSpan = document.getElementById('player-credits');
    const botCreditsSpan = document.getElementById('bot-credits');
    const dealButton = document.getElementById('deal-button');
    const checkButton = document.getElementById('check-button');
    const betButton = document.getElementById('bet-button');
    const callButton = document.getElementById('call-button');
    const raiseButton = document.getElementById('raise-button'); // Keep refs even if not fully used
    const foldButton = document.getElementById('fold-button');
    const drawButton = document.getElementById('draw-button');
    const actionArea = document.getElementById('action-area');


    // --- Core Game Logic Functions ---

    function createDeck() {
        const newDeck = [];
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                newDeck.push({ suit, rank });
            }
        }
        return newDeck;
    }

    function shuffleDeck(deckToShuffle) {
        // Fisher-Yates (Knuth) Shuffle
        for (let i = deckToShuffle.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deckToShuffle[i], deckToShuffle[j]] = [deckToShuffle[j], deckToShuffle[i]];
        }
    }

    function dealHand(deckSource, numCards) {
        const hand = [];
        for (let i = 0; i < numCards; i++) {
            if (deckSource.length > 0) {
                hand.push(deckSource.pop());
            } else {
                console.error("Deck is empty!"); // Should not happen in 5-card draw usually
                break;
            }
        }
        return hand;
    }

    function getCardHTML(card, faceDown = false, isPlayerCard = false) {
         if (faceDown) {
            return '<div class="card face-down"></div>';
         }
        const suitClass = `suit-${card.suit}`;
        let suitSymbol = '';
        switch (card.suit) {
            case 'H': suitSymbol = '♥'; break;
            case 'D': suitSymbol = '♦'; break;
            case 'C': suitSymbol = '♣'; break;
            case 'S': suitSymbol = '♠'; break;
        }
        // Add clickable class only for player cards during DRAWING phase
        const clickableClass = (isPlayerCard && gameState === 'DRAWING') ? ' clickable' : '';
        return `
            <div class="card ${suitClass}${clickableClass}" data-suit="${card.suit}" data-rank="${card.rank}">
                <span class="rank">${card.rank}</span>
                <span class="suit">${suitSymbol}</span>
            </div>`;
    }


    function displayHand(element, hand, faceDown = false, isPlayer = false) {
        element.innerHTML = hand.map((card, index) => {
             const cardHTML = getCardHTML(card, faceDown, isPlayer);
             // Attach index for selection later if it's a player card
            if (isPlayer && !faceDown) {
                // Inject index data directly for simplicity here
                 return cardHTML.replace('<div class="card', `<div class="card" data-index="${index}"`);
             }
             return cardHTML;
         }).join('');

        // Add event listeners ONLY for player cards during the DRAWING phase
        if (isPlayer && gameState === 'DRAWING') {
             const cardElements = element.querySelectorAll('.card.clickable');
             cardElements.forEach(cardEl => {
                 cardEl.addEventListener('click', toggleCardSelection);
             });
        }
    }

    function displayMessage(msg, append = false) {
         if (append) {
             messageDiv.innerHTML += `<br>${msg}`; // Add line break
         } else {
             messageDiv.textContent = msg;
         }
     }

     function updateCreditsAndPot() {
        playerCreditsSpan.textContent = playerCredits;
        botCreditsSpan.textContent = botCredits;
        potSpan.textContent = pot;
    }

    // --- Hand Evaluation (Crucial & Complex Part) ---
     function evaluateHand(hand) {
        if (!hand || hand.length !== 5) return { rank: HAND_RANKINGS.HIGH_CARD, name: HAND_NAMES[0], highCards: [] };

        const ranks = hand.map(card => RANK_VALUES[card.rank]).sort((a, b) => b - a); // Sort numerically descending
        const suits = hand.map(card => card.suit);
        const rankCounts = {};
        ranks.forEach(rank => rankCounts[rank] = (rankCounts[rank] || 0) + 1);
        const counts = Object.values(rankCounts).sort((a, b) => b - a); // [3, 2], [2, 2, 1], [4, 1] etc.

        const isFlush = new Set(suits).size === 1;
        // Check for straight: lowest card + 4 equals highest card, or Ace-low straight
        let isStraight = false;
        const uniqueRanks = [...new Set(ranks)]; // Unique sorted ranks
         if (uniqueRanks.length >= 5) { // Need 5 unique ranks for a straight possibility
            // Normal straight check
             isStraight = uniqueRanks[0] === uniqueRanks[4] + 4;
             // Ace-low straight check (A, 5, 4, 3, 2 -> ranks=[14, 5, 4, 3, 2])
             if (!isStraight && uniqueRanks[0] === 14 && uniqueRanks[1] === 5 && uniqueRanks[2] === 4 && uniqueRanks[3] === 3 && uniqueRanks[4] === 2) {
                 isStraight = true;
                 // Important: For ranking, treat Ace as 1 in A-5 straight comparison
                 ranks.splice(ranks.indexOf(14), 1); // Remove 14
                 ranks.push(1); // Add 1
                 ranks.sort((a, b) => b - a); // Re-sort: [5, 4, 3, 2, 1]
             }
        }


        if (isStraight && isFlush) {
            // Royal flush (Ace-high straight flush)
            if (ranks[0] === 14 && ranks[4] === 10) { // Highest card Ace, lowest Ten (in the sorted straight)
                 return { rank: HAND_RANKINGS.ROYAL_FLUSH, name: HAND_NAMES[9], highCards: ranks };
            }
            // Regular straight flush
            return { rank: HAND_RANKINGS.STRAIGHT_FLUSH, name: HAND_NAMES[8], highCards: ranks };
        }
        if (counts[0] === 4) {
             const fourRank = parseInt(Object.keys(rankCounts).find(k => rankCounts[k] === 4));
             const kicker = parseInt(Object.keys(rankCounts).find(k => rankCounts[k] === 1));
             return { rank: HAND_RANKINGS.FOUR_OF_A_KIND, name: HAND_NAMES[7], highCards: [fourRank, kicker] }; // High card = rank of the four, then kicker
        }
        if (counts[0] === 3 && counts[1] === 2) {
             const threeRank = parseInt(Object.keys(rankCounts).find(k => rankCounts[k] === 3));
             const pairRank = parseInt(Object.keys(rankCounts).find(k => rankCounts[k] === 2));
            return { rank: HAND_RANKINGS.FULL_HOUSE, name: HAND_NAMES[6], highCards: [threeRank, pairRank] }; // High card = rank of the three, then the pair
        }
        if (isFlush) {
            return { rank: HAND_RANKINGS.FLUSH, name: HAND_NAMES[5], highCards: ranks }; // Compare highest cards in flush
        }
        if (isStraight) {
            // High card is the highest card in the straight (ranks[0] after Ace-low adjustment if necessary)
            return { rank: HAND_RANKINGS.STRAIGHT, name: HAND_NAMES[4], highCards: [ranks[0]] };
        }
        if (counts[0] === 3) {
             const threeRank = parseInt(Object.keys(rankCounts).find(k => rankCounts[k] === 3));
             const kickers = ranks.filter(r => r !== threeRank).sort((a, b) => b - a);
             return { rank: HAND_RANKINGS.THREE_OF_A_KIND, name: HAND_NAMES[3], highCards: [threeRank, ...kickers] };
        }
        if (counts[0] === 2 && counts[1] === 2) {
             const pairRanks = Object.keys(rankCounts).filter(k => rankCounts[k] === 2).map(r => parseInt(r)).sort((a, b) => b - a);
             const kicker = ranks.find(r => !pairRanks.includes(r));
             return { rank: HAND_RANKINGS.TWO_PAIR, name: HAND_NAMES[2], highCards: [...pairRanks, kicker] };
        }
        if (counts[0] === 2) {
             const pairRank = parseInt(Object.keys(rankCounts).find(k => rankCounts[k] === 2));
             const kickers = ranks.filter(r => r !== pairRank).sort((a, b) => b - a);
            return { rank: HAND_RANKINGS.PAIR, name: HAND_NAMES[1], highCards: [pairRank, ...kickers] };
        }
        // High Card
         return { rank: HAND_RANKINGS.HIGH_CARD, name: HAND_NAMES[0], highCards: ranks };
    }

    function compareHands(playerEval, botEval) {
         if (playerEval.rank > botEval.rank) return 'Player';
         if (botEval.rank > playerEval.rank) return 'Bot';

         // Tie-breaker using highCards arrays
         for (let i = 0; i < playerEval.highCards.length; i++) {
            // If bot runs out of comparison cards first (e.g., Pair vs High Card with same kickers), player wins
            if (i >= botEval.highCards.length) return 'Player';

             if (playerEval.highCards[i] > botEval.highCards[i]) return 'Player';
             if (botEval.highCards[i] > playerEval.highCards[i]) return 'Bot';
        }
         // If all comparison cards are equal (or bot had fewer relevant cards like in 4oak)
         if (botEval.highCards.length > playerEval.highCards.length) return 'Bot';

        return 'Tie'; // Absolute tie
    }


    // --- Player Actions ---

    function handleCheck() {
        if (gameState !== 'BETTING_1' && gameState !== 'BETTING_2') return;
        displayMessage("You CHECK.");
        // If bot already bet, Check is not possible, should be Call/Fold. Handled by enable/disable logic.
        // Simple logic: Bot bets if Player checks
        if (currentBet === 0) {
            setTimeout(handleBotBetting, 1000); // Bot takes its turn after check
        } else {
             // This state shouldn't happen if buttons are correct, means player checked when call needed
             console.error("Invalid Check Action");
        }

    }

    function handleBet() {
         if (gameState !== 'BETTING_1' && gameState !== 'BETTING_2') return;
         if (playerCredits < BET_AMOUNT) {
            displayMessage("Not enough credits to bet!");
             return;
         }
        playerCredits -= BET_AMOUNT;
        pot += BET_AMOUNT;
        currentBet = BET_AMOUNT; // The bet to be called now
        updateCreditsAndPot();
        displayMessage(`You BET ${BET_AMOUNT}.`);
         // Now it's the Bot's turn to Call/Raise/Fold
        setTimeout(handleBotBetting, 1000);
    }

    function handleCall() {
         if (gameState !== 'BETTING_1' && gameState !== 'BETTING_2') return;
         const callAmount = currentBet; // The amount the bot bet that player needs to call
         if (playerCredits < callAmount) {
             displayMessage("Not enough credits to call!");
             return;
         }
         playerCredits -= callAmount;
         pot += callAmount;
         currentBet = callAmount; // Betting level remains same, round ends unless raise happened
         updateCreditsAndPot();
         displayMessage(`You CALL ${callAmount}.`);
         // Calling ends the betting round
        if (gameState === 'BETTING_1') {
             transitionToDrawPhase();
         } else if (gameState === 'BETTING_2') {
            transitionToShowdown();
        }
    }


    function handleFold() {
        if (gameState !== 'BETTING_1' && gameState !== 'BETTING_2') return;
         displayMessage("You FOLD.");
         botCredits += pot; // Bot wins the pot
        pot = 0;
         updateCreditsAndPot();
         gameState = 'START'; // Allow starting a new hand
        enableDealButtonOnly();
         setTimeout(askToDealAgain, 1500);
    }

     function toggleCardSelection(event) {
         if (gameState !== 'DRAWING') return;
         const cardDiv = event.currentTarget;
         const index = parseInt(cardDiv.dataset.index);

         if (cardsToDiscard.includes(index)) {
             // Deselect
             cardsToDiscard = cardsToDiscard.filter(i => i !== index);
             cardDiv.classList.remove('selected');
         } else {
            // Select (Limit selection? 5-card draw usually no limit)
            cardsToDiscard.push(index);
             cardDiv.classList.add('selected');
         }
          // Enable draw button only if player selected at least one card OR none
          drawButton.disabled = false; // Allow drawing 0 cards
     }

     function handleDraw() {
         if (gameState !== 'DRAWING') return;

         // Remove selected style, disable clicking
         playerCardsDiv.querySelectorAll('.card').forEach(c => c.classList.remove('selected', 'clickable'));

         // Sort indices descending to avoid shifting issues when removing
         cardsToDiscard.sort((a, b) => b - a);

         const numToDraw = cardsToDiscard.length;
          displayMessage(`You discard ${numToDraw} card${numToDraw !== 1 ? 's' : ''}.`);

          // Remove discarded cards from hand
         cardsToDiscard.forEach(index => {
            playerHand.splice(index, 1);
         });

         // Deal new cards
         const newCards = dealHand(deck, numToDraw);
         playerHand.push(...newCards);

          // Display the updated hand immediately
          displayHand(playerCardsDiv, playerHand, false, true); // Redisplay with new cards, no longer clickable


          cardsToDiscard = []; // Reset discard selection

          // Bot draws cards
          setTimeout(handleBotDraw, 1500);
     }

     function askToDealAgain() {
        if (playerCredits <= 0 || botCredits <= 0) {
            gameState = 'GAME_OVER';
            displayMessage(playerCredits <= 0 ? "GAME OVER - You're out of credits!" : "GAME OVER - Bot is out of credits!");
             dealButton.disabled = true;
        } else {
            displayMessage("Deal again?", true); // Append message
            dealButton.disabled = false;
        }
     }

    // --- Bot AI Logic ---

    function handleBotBetting() {
        const botEval = evaluateHand(botHand);
         // Simple AI: Bet with Pair or better, Check otherwise (if possible)
        // If player bet (currentBet > 0) bot needs to Call/Fold/Raise
         if (currentBet > 0) { // Player has bet, bot must respond
            const callAmount = currentBet; // How much player bet
            if (botEval.rank >= HAND_RANKINGS.PAIR && botCredits >= callAmount) {
                 // Call the bet
                 displayMessage(`Bot CALLS ${callAmount}.`);
                 botCredits -= callAmount;
                 pot += callAmount;
                 updateCreditsAndPot();
                 // Calling ends the round
                 if (gameState === 'BETTING_1') transitionToDrawPhase();
                 else if (gameState === 'BETTING_2') transitionToShowdown();
            } else if (botEval.rank < HAND_RANKINGS.PAIR && botCredits >= callAmount * 2) {
                 // Simple Bluff? Or sometimes fold weak. Let's make it fold for now.
                 displayMessage("Bot FOLDS.");
                 playerCredits += pot;
                 pot = 0;
                 updateCreditsAndPot();
                 gameState = 'START';
                enableDealButtonOnly();
                setTimeout(askToDealAgain, 1500);
            } else {
                // Fold if can't call or weak hand
                 displayMessage("Bot FOLDS.");
                 playerCredits += pot;
                 pot = 0;
                 updateCreditsAndPot();
                 gameState = 'START';
                 enableDealButtonOnly();
                 setTimeout(askToDealAgain, 1500);
            }
         } else { // Player Checked or first action
             if (botEval.rank >= HAND_RANKINGS.PAIR && botCredits >= BET_AMOUNT) {
                 // Bot bets
                 displayMessage(`Bot BETS ${BET_AMOUNT}.`);
                 botCredits -= BET_AMOUNT;
                 pot += BET_AMOUNT;
                 currentBet = BET_AMOUNT; // Now player must respond
                 updateCreditsAndPot();
                 // Player's turn again
                 enablePlayerBettingResponse(true); // Enable Call/Fold for player
             } else {
                 // Bot Checks
                 displayMessage("Bot CHECKS.");
                  // Both checked, move to next phase
                 if (gameState === 'BETTING_1') transitionToDrawPhase();
                 else if (gameState === 'BETTING_2') transitionToShowdown();
             }
        }
    }

     function handleBotDraw() {
         const botEval = evaluateHand(botHand);
         let botDiscards = []; // Indices to discard

         // Simple Draw AI
         switch (botEval.rank) {
            case HAND_RANKINGS.FOUR_OF_A_KIND: // Keep the 4
                botDiscards = [botHand.findIndex(c => RANK_VALUES[c.rank] !== botEval.highCards[0])];
                 break;
             case HAND_RANKINGS.FULL_HOUSE: // Keep all
             case HAND_RANKINGS.FLUSH:
             case HAND_RANKINGS.STRAIGHT:
             case HAND_RANKINGS.STRAIGHT_FLUSH: // Keep all
                 botDiscards = [];
                 break;
            case HAND_RANKINGS.THREE_OF_A_KIND: // Keep the 3, discard 2 others
                botDiscards = botHand.map((c, i) => RANK_VALUES[c.rank] !== botEval.highCards[0] ? i : -1).filter(i => i !== -1);
                 break;
             case HAND_RANKINGS.TWO_PAIR: // Keep the two pairs, discard the 5th card
                botDiscards = [botHand.findIndex(c => RANK_VALUES[c.rank] === botEval.highCards[2])]; // Index of the kicker
                 break;
            case HAND_RANKINGS.PAIR: // Keep the pair, discard 3 others
                botDiscards = botHand.map((c, i) => RANK_VALUES[c.rank] !== botEval.highCards[0] ? i : -1).filter(i => i !== -1);
                break;
            default: // High Card: Keep top 1 or 2, discard rest? Simple: discard bottom 3
                const sortedIndices = botHand.map((c, i) => ({ rank: RANK_VALUES[c.rank], index: i }))
                                          .sort((a, b) => a.rank - b.rank) // Sort ascending by rank
                                          .map(item => item.index);
                 botDiscards = sortedIndices.slice(0, 3); // Discard lowest 3
                 break;
        }

        botDiscards = botDiscards.filter(i => i !== -1 && i < botHand.length); // Filter invalid indices

         const numBotDraws = botDiscards.length;
         displayMessage(`Bot discards ${numBotDraws} card${numBotDraws !== 1 ? 's' : ''}.`, true);

         // Sort indices descending
        botDiscards.sort((a, b) => b - a);

         // Remove cards
         botDiscards.forEach(index => {
            botHand.splice(index, 1);
         });

         // Deal new cards
         const botNewCards = dealHand(deck, numBotDraws);
         botHand.push(...botNewCards);

        // (Optional) Display bot's hand face down again after draw? Not standard poker practice.
        // displayHand(botCardsDiv, botHand, true); // Keep hidden

        // Move to second betting round
        setTimeout(transitionToBetting2, 1500);
    }

    // --- Game Flow Control & Transitions ---

    function startGame() {
        if (gameState === 'GAME_OVER') {
             displayMessage("Game Over. Cannot start new game.");
             return;
        }

        // Check if enough credits for Ante
        if (playerCredits < ANTE || botCredits < ANTE) {
             gameState = 'GAME_OVER';
             displayMessage("Not enough credits for ante! Game Over.");
             enableDealButtonOnly();
             dealButton.disabled = true; // Truly game over
             return;
         }

        // Reset game variables
        deck = createDeck();
        shuffleDeck(deck);
        playerHand = [];
        botHand = [];
        pot = 0;
        currentBet = 0;
        cardsToDiscard = [];
        betTurn = 0; // Reset bet turn

        // Ante up
         playerCredits -= ANTE;
         botCredits -= ANTE;
         pot = ANTE * 2;
         updateCreditsAndPot();
         displayMessage(`Ante ${ANTE} paid. Shuffling and dealing...`);

         // Deal hands
        playerHand = dealHand(deck, 5);
        botHand = dealHand(deck, 5);

         // Display hands
        displayHand(playerCardsDiv, playerHand, false, true);
        displayHand(botCardsDiv, botHand, true); // Keep bot hand hidden

        // Transition to Betting Round 1
         gameState = 'BETTING_1';
         setTimeout(() => { // Short delay for effect
            displayMessage("Your turn to bet.");
             enablePlayerBetting(false); // Enable Check/Bet/Fold (no call needed initially)
         }, 1000);

    }

    function transitionToDrawPhase() {
        gameState = 'DRAWING';
         currentBet = 0; // Reset bet amount for next round
        displayMessage("Select cards to discard (0-5), then click DRAW.");
        enableDrawButtonOnly(); // Only draw button active
        drawButton.disabled = true; // Disable initially until cards are clicked/deselected

         // Make player cards clickable
         displayHand(playerCardsDiv, playerHand, false, true); // Re-render to add clickable class
     }

     function transitionToBetting2() {
        gameState = 'BETTING_2';
         betTurn = 1;
         currentBet = 0; // Reset for this round
         displayMessage("Second betting round. Your turn.");
        enablePlayerBetting(false); // Allow player to Check/Bet first
     }


     function transitionToShowdown() {
        gameState = 'SHOWDOWN';
        displayMessage("Showdown!");
        disableAllActions();

        // Reveal Bot's hand
         displayHand(botCardsDiv, botHand, false); // Show bot cards

         const playerEval = evaluateHand(playerHand);
         const botEval = evaluateHand(botHand);

         displayMessage(`Your hand: ${playerEval.name}`, true);
         displayMessage(`Bot hand: ${botEval.name}`, true);

        setTimeout(() => {
             const winner = compareHands(playerEval, botEval);
            let winMessage = '';
             if (winner === 'Player') {
                winMessage = `YOU WIN the pot of ${pot}!`;
                 playerCredits += pot;
            } else if (winner === 'Bot') {
                winMessage = `Bot wins the pot of ${pot}.`;
                 botCredits += pot;
            } else {
                winMessage = `It's a TIE! Pot of ${pot} is split.`;
                 playerCredits += Math.floor(pot / 2);
                 botCredits += Math.ceil(pot / 2); // Bot gets remainder if odd
            }
            pot = 0;
             displayMessage(winMessage, true);
             updateCreditsAndPot();

             gameState = 'START'; // Ready for next hand
             setTimeout(askToDealAgain, 2500); // Wait longer after showdown
         }, 2000); // Wait for player to see hands before declaring winner
     }

    // --- Button Enabling/Disabling Logic ---

     function disableAllActions() {
        dealButton.disabled = true;
        checkButton.disabled = true;
        betButton.disabled = true;
        callButton.disabled = true;
        raiseButton.disabled = true;
        foldButton.disabled = true;
        drawButton.disabled = true;
     }

     function enableDealButtonOnly() {
         disableAllActions();
         // Only enable deal if players have enough for ante
         dealButton.disabled = playerCredits < ANTE || botCredits < ANTE;
         if (playerCredits < ANTE || botCredits < ANTE) {
             if (gameState !== 'GAME_OVER') { // Avoid overwriting final message
                 displayMessage("Not enough credits for next ante!", true);
                 gameState = 'GAME_OVER'; // Trigger game over state if credits drop
             }
         }
     }


    function enablePlayerBetting(isRespondingToBet) {
         disableAllActions();
         foldButton.disabled = false; // Can always fold (unless it's literally game over)

         if (isRespondingToBet) {
            // Player must Call, Raise (not implemented fully yet), or Fold
             callButton.disabled = playerCredits < currentBet; // Can't call if not enough credits
            // raiseButton.disabled = playerCredits < currentBet * 2; // Simple raise logic check
         } else {
            // Player can Check or Bet
             checkButton.disabled = false;
             betButton.disabled = playerCredits < BET_AMOUNT;
         }
     }

      function enablePlayerBettingResponse(isRespondingToBet) {
         disableAllActions();
         foldButton.disabled = false;

         if (isRespondingToBet) {
             callButton.disabled = playerCredits < currentBet;
             // raiseButton.disabled = playerCredits < currentBet * 2;
         } else {
             // Should not be called with false when responding needed
             console.error("Invalid call to enablePlayerBettingResponse");
         }
      }


     function enableDrawButtonOnly() {
         disableAllActions();
         drawButton.disabled = false; // Initially allow drawing 0
         // Add back listeners to cards if they were removed
         displayHand(playerCardsDiv, playerHand, false, true);
     }


    // --- Event Listeners ---
    dealButton.addEventListener('click', startGame);
    checkButton.addEventListener('click', handleCheck);
    betButton.addEventListener('click', handleBet);
    callButton.addEventListener('click', handleCall);
    // raiseButton.addEventListener('click', handleRaise); // Add handler if implementing
    foldButton.addEventListener('click', handleFold);
     drawButton.addEventListener('click', handleDraw);


    // --- Initial Setup ---
    function initializeGame() {
        displayMessage("Welcome to Retro Poker! Ante up!");
         updateCreditsAndPot();
         enableDealButtonOnly(); // Only deal button active initially
    }

    initializeGame(); // Start the game on load

});