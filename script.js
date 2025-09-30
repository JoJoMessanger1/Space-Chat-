// script.js (FINAL MIT NEUER MENÜSTRUKTUR & P2P-FALLBACK)

import * as P2PManager from './p2p_manager.js';

// --- BASIS-DATENSTRUKTUR & INITIALISIERUNG ---

const myUserID = P2PManager.generateLocalID(); 
let myUserName = localStorage.getItem('myUserName') || "Ich (Noch kein Name festgelegt)";
let activeChatID = null;

function loadData() {
    const contacts = localStorage.getItem('contacts');
    const messages = localStorage.getItem('messages');
    
    return {
        contacts: contacts ? JSON.parse(contacts) : { 
            [myUserID]: { name: myUserName, isGroup: false, p2p_id: myUserID }
        },
        messages: messages ? JSON.parse(messages) : {}
    };
}
let AppData = loadData();

function updateLocalStorage() {
    localStorage.setItem('contacts', JSON.stringify(AppData.contacts));
    localStorage.setItem('messages', JSON.stringify(AppData.messages));
}

function getLastMessage(chatID) {
    const chatMessages = AppData.messages[chatID];
    return chatMessages && chatMessages.length > 0 ? chatMessages[chatMessages.length - 1] : null;
}

// --- UI RENDER FUNKTIONEN (UNVERÄNDERT) ---
// ... (Die Render-Funktionen sind unverändert und korrekt) ...

function renderChatList() {
    const chatListElement = document.getElementById('chat-list');
    chatListElement.innerHTML = '';
    
    const sortedChatIDs = Object.keys(AppData.contacts).sort((idA, idB) => {
        if (idA === myUserID) return 1; 
        if (idB === myUserID) return -1;
        const msgB = getLastMessage(idB);
        const msgA = getLastMessage(idA);
        return (msgB?.timestamp || 0) - (msgA?.timestamp || 0);
    });

    sortedChatIDs.forEach(id => {
        const contact = AppData.contacts[id];
        const lastMessage = getLastMessage(id);

        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.dataset.chatID = id;
        chatItem.innerHTML = `
            <div>
                <strong>${contact.name}</strong> 
                <p style="color:#666; font-size:0.9em;">
                    ${lastMessage ? (lastMessage.senderID === myUserID ? 'Du: ' : '') + lastMessage.text.substring(0, 30) + (lastMessage.text.length > 30 ? '...' : '') : 'Keine Nachrichten'}
                </p>
            </div>
        `;
        chatItem.addEventListener('click', () => {
            activeChatID = id;
            const chatHeader = document.getElementById('chat-header');
            chatHeader.innerHTML = `<span id="current-chat-name">${contact.name}</span>`;
            
            if (contact.isGroup) {
                chatHeader.classList.add('clickable-header');
                chatHeader.onclick = window.showGroupDetails; 
            } else {
                chatHeader.classList.remove('clickable-header');
                chatHeader.onclick = null;
            }

            renderMessages(id);
        });
        chatListElement.appendChild(chatItem);
    });
}

function renderMessages(chatID) {
    const messagesElement = document.getElementById('messages');
    messagesElement.innerHTML = '';
    
    const chatMessages = AppData.messages[chatID] || [];
    const isGroup = AppData.contacts[chatID]?.isGroup;

    chatMessages.forEach(msg => {
        const messageDiv = document.createElement('div');
        const isSent = msg.senderID === myUserID;
        const senderInfo = AppData.contacts[msg.senderID];
        const senderName = (senderInfo && senderInfo.name !== 'Ich') ? senderInfo.name : msg.senderID;

        messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
        
        if (!isSent && isGroup) {
            const senderSpan = document.createElement('span');
            senderSpan.textContent = senderName + ': ';
            senderSpan.style.fontWeight = 'bold';
            senderSpan.style.color = '#34B7F1'; 
            messageDiv.appendChild(senderSpan);
        }

        messageDiv.appendChild(document.createTextNode(msg.text));
        messagesElement.appendChild(messageDiv);
    });

    messagesElement.scrollTop = messagesElement.scrollHeight;
}


// --- GRUPPEN-VERBINDUNGSLOGIK (UNVERÄNDERT) ---

window.showGroupDetails = function() { 
    if (!activeChatID || !AppData.contacts[activeChatID].isGroup) return;

    const group = AppData.contacts[activeChatID];
    let memberListHTML = `<div style="padding: 15px;"><h3>Gruppenmitglieder (${group.name})</h3><p>Wählen Sie Verbinden, um P2P automatisch (4) oder manuell (5) zu starten.</p>`;

    group.members.forEach(memberID => {
        if (memberID === myUserID) {
            memberListHTML += `<p><strong>${myUserName} (Sie) - ID: ${memberID}</strong></p>`;
