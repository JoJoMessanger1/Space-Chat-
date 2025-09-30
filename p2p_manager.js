// p2p_manager.js (FINAL MIT ÖFFENTLICHEM TEST-RELAY-SERVER UND MANUELLEM FALLBACK)

// --- 0. KONFIGURATION FÜR DEN SERVER ---
const SIGNALING_SERVER_URL = 'wss://signaling.herokuapp.com/ws'; 

let ws = null; 

// --- 1. KONFIGURATION FÜR P2P & GLOBALE VARIABLEN ---
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.services.mozilla.com' }
    ]
};

let peerConnections = {}; 
let dataChannels = {};
let localID = null;

// --- 2. WEBSOCKET-VERBINDUNG UND SIGNALING ---

function connectWebSocket(onMessageCallback) {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    ws = new WebSocket(SIGNALING_SERVER_URL);

    ws.onopen = () => {
        console.log('✅ WebSocket verbunden mit öffentlichem Relay.');
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (!data.receiverID || data.receiverID === localID) {
                handleSignalingMessage(data, onMessageCallback);
            }
        } catch (e) {
            console.error('Fehler beim Parsen der WebSocket-Nachricht:', e);
        }
    };

    ws.onerror = (error) => {
        console.error('❌ WebSocket-Fehler: Server nicht erreichbar.', error);
        alert("ACHTUNG: Automatisches Signaling ist momentan NICHT möglich (Server down). Nutzen Sie Option 5 im Menü.");
    };

    ws.onclose = () => {
        console.log('❌ WebSocket geschlossen.');
    };
}

function sendSignalingMessage(partnerID, type, payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const message = JSON.stringify({
            type: type,
            senderID: localID,
            receiverID: partnerID,
            payload: payload
        });
        ws.send(message);
        return true;
    }
    return false;
}

async function handleSignalingMessage(data, onMessageCallback) {
    const partnerID = data.senderID;
    const pc = createConnection(partnerID, onMessageCallback); 

    try {
        if (data.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.payload));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendSignalingMessage(partnerID, 'answer', answer);
            console.log(`✅ Offer von ${partnerID} verarbeitet, Answer gesendet.`);
        } else if (data.type === 'answer') {
            if (pc.remoteDescription?.type !== 'answer') {
                 await pc.setRemoteDescription(new RTCSessionDescription(data.payload));
                 console.log(`✅ Answer von ${partnerID} verarbeitet.`);
            }
        } else if (data.type === 'candidate') {
            await pc.addIceCandidate(new RTCIceCandidate(data.payload));
        }
    } catch (e) {
        console.error(`Fehler bei der Verarbeitung von ${data.type} von ${partnerID}:`, e);
    }
}


// --- 3. P2P-FUNKTIONEN ---

export function generateLocalID() {
    let storedID = localStorage.getItem('localP2PID');
    if (!storedID) {
        storedID = 'P2P-' + Math.random().toString(36).substring(2, 9).toUpperCase();
        localStorage.setItem('localP2PID', storedID);
    }
    localID = storedID;
    return localID;
}

function createConnection(partnerID, onMessageCallback) {
    if (peerConnections[partnerID]) return peerConnections[partnerID];

    const pc = new RTCPeerConnection(configuration);
    peerConnections[partnerID] = pc;

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            sendSignalingMessage(partnerID, 'candidate', event.candidate.toJSON());
        }
    };

    pc.ondatachannel = (event) => {
        dataChannels[partnerID] = event.channel;
        setupDataChannelEvents(partnerID, onMessageCallback);
    };
    
    return pc;
}

/**
 * Erstellt ein Offer, ABER zeigt den Code zum Kopieren an, da der Server nicht verfügbar ist.
 */
async function createManualOfferInternal(partnerID, onMessageCallback) {
    const pc = createConnection(partnerID, onMessageCallback);
    if (!dataChannels[partnerID]) {
        dataChannels[partnerID] = pc.createDataChannel("chat");
        setupDataChannelEvents(partnerID, onMessageCallback);
    }

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Baut den manuellen Code, der nur ID und Offer enthält
    const code = `OFFER:${localID}:${JSON.stringify(offer)}`;
    
    // Statt zu senden, wird der Code angezeigt
    prompt(`P2P-OFFER FÜR ${partnerID}. Kopieren Sie diesen Code und senden Sie ihn manuell (z.B. per E-Mail/anderem Chat) an Ihren Partner.`, code);
}

/**
 * Erstellt die Verbindung und sendet das "Angebot" (Offer) AUTOMATISCH. (Option 4)
 */
export async function createAutomaticOffer(partnerID, onMessageCallback) {
    connectWebSocket(onMessageCallback); 

    const pc = createConnection(partnerID, onMessageCallback);
    if (!dataChannels[partnerID]) {
        dataChannels[partnerID] = pc.createDataChannel("chat");
        setupDataChannelEvents(partnerID, onMessageCallback);
    }

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sent = sendSignalingMessage(partnerID, 'offer', offer);
    
    // Falls das automatische Senden fehlschlägt, den manuellen Code anzeigen.
    if (!sent) {
        console.warn("Automatisches Senden fehlgeschlagen, zeige manuellen Code an.");
        const code = `OFFER:${localID}:${JSON.stringify(offer)}`;
        prompt(`Das automatische Signaling ist fehlgeschlagen. Manuelles OFFER für ${partnerID}:`, code);
    }
}

/**
 * Startet das manuelle Signaling: entweder Offer erstellen oder Code eingeben (Option 5).
 */
export async function startManualSignaling(partnerID, onMessageCallback) {
    const action = prompt(`Wählen Sie für Partner ${partnerID}:\n\nO: OFFER erstellen und Code kopieren\nE: ANSWER oder KANDIDAT Code eingeben`).toUpperCase();

    if (action === 'O') {
        await createManualOfferInternal(partnerID, onMessageCallback);
    } else if (action === 'E') {
        const code = prompt("Fügen Sie den vollständigen P2P-Code (ANSWER oder KANDIDAT) hier ein:");
        if (code) {
            await handleManualCode(code, onMessageCallback);
        }
    } else {
        alert("Ungültige Auswahl.");
    }
}

/**
 * Verarbeitet manuelle Codes (Answer oder Kandidat).
 */
async function handleManualCode(code, onMessageCallback) {
    const parts = code.split(':');
    if (parts.length < 3) {
        alert("Fehlerhaftes Code-Format. Erwartet: TYP:ID:{JSON_Payload}");
        return;
    }
    
    const type = parts[0];
    const partnerID = parts[1];
    const sdpPayload = parts.slice(2).join(':');

    if (type === 'ANSWER') {
        const pc = createConnection(partnerID, onMessageCallback);
        await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(sdpPayload)));
        alert(`✅ ANSWER von ${partnerID} verarbeitet. Verbindung sollte sich aufbauen.`);
    } else if (type === 'KANDIDAT' || type === 'CANDIDATE') {
        const pc = createConnection(partnerID, onMessageCallback); 
        await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(sdpPayload)));
        alert(`📡 Kandidat von ${partnerID} hinzugefügt.`);
    } else {
        alert("Ungültiger oder falscher Code-Typ im manuellen Austausch.");
    }
}


// --- 4. DATENKANAL HILFSFUNKTIONEN (UNVERÄNDERT) ---

function setupDataChannelEvents(partnerID, onMessageCallback) {
    const dc = dataChannels[partnerID];

    dc.onopen = () => {
        console.log(`✅ P2P DataChannel zu ${partnerID} ist offen!`);
    };
    dc.onmessage = (event) => {
        const data = JSON.parse(event.data);
        onMessageCallback(data.senderID, data.text);
    };
    dc.onclose = () => console.log(`P2P DataChannel zu ${partnerID} geschlossen.`);
    dc.onerror = (error) => console.error(`P2P DataChannel Fehler zu ${partnerID}:`, error);
}

export function sendP2PMessage(partnerID, message) {
    const dc = dataChannels[partnerID];
    if (dc && dc.readyState === 'open') {
        const payload = JSON.stringify({ senderID: localID, text: message });
        dc.send(payload);
        return true;
    }
    return false;
}

export function getConnectionStatus(partnerID) {
    const dc = dataChannels[partnerID];
    if (dc) {
        return dc.readyState; 
    }
    const pc = peerConnections[partnerID];
    if (pc && pc.connectionState === 'connecting') {
        return 'connecting'; 
    }
    return 'none';
}

export function closeConnection(partnerID) {
    if (dataChannels[partnerID]) {
        dataChannels[partnerID].close();
        delete dataChannels[partnerID];
    }
    if (peerConnections[partnerID]) {
        peerConnections[partnerID].close();
        delete peerConnections[partnerID];
    }
}
