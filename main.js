import firebase from 'firebase/app'
import 'firebase/firestore'
import { snapshotEqual } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAl9LXt7zQJBrLwmbMJkd7KCaJKqyWp-0E",
  authDomain: "video-conferencing-2533b.firebaseapp.com",
  projectId: "video-conferencing-2533b",
  storageBucket: "video-conferencing-2533b.appspot.com",
  messagingSenderId: "802376064628",
  appId: "1:802376064628:web:61f638381a6813b1613b21",
  measurementId: "G-NZ0PF9NTXP"
};

if (!firebase.getApps.length) {
    firebase.initializeApp(firebaseConfig);
}

const firestore = firebase.firestore()

const servers = {
    iceServers: [
        {
            urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302']
        },
    ],
    iceCandidatePoolSize: 10,
}

//--- Global State----
let pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

const webcamButton = document.getElementById("webcamButton");
const webcamVideo = document.getElementById("webcamVideo");
const callButton = document.getElementById("callButton");
const callInput = document.getElementById("callInput");
const answerButton = document.getElementById("answerButton");
const remoteVideo = document.getElementById("remoteVideo");
const hangupButton = document.getElementById("hangupButton");

webcamButton.onclick = async () => {
    localStream = await navigator.mediaDevices.getUserMedia({video:true, audio:true});
    remoteStream = new MediaStream();

    localStream.getTracks().forEach((track) =>{
        pc.addTrack(track, localStream);
    });

    pc.ontrack = event => {
        event.streams[0].getTracks().forEach(track => {
            remoteStream.addTrack(track);
        });
    };

    webcamVideo.srcObject = localStream;
    remoteVideo.srcObject = remoteStream;
};


//----Create Offer----
callButton.onclick = async () => {
    const callDoc = firestore.collection('calls').doc();
    const offerCandidates = callDoc.collection('offerCandidates');
    const answerCandidates = callDoc.collection('answerCandidates');

    callInput.value = callDoc.id;

    pc.onicecandidate = event => {
        event.candidate && offerCandidates.add(event.candidate.toJSON());
    };

    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);

    const offer = {
        sdp: offerDescription.sdp,
        type: offerDescription.type,
    };

    await callDoc.set({offer});

    callDoc.onSnapshot((snapshot) => {
        const data = snapshot.data();
        if (!pc.currentRemoteDescription && data?.answer) {
            const answerDescription = new RTCSessionDescription(data.answer);
            pc.setRemoteDescription(answerDescription);
        }
    });

    answerCandidates.onSnapshot(snapshot => {
        snapshot.docChanges().forEach((change) => {
            if (change.type == 'added') {
                const candidate = new RTCIceCandidate(change.doc.data());
                pc.addIceCandidate(candidate);
            }
        });
    });

};

answerButton.onclick = async () => {
    const callId = callInput.value;
    const callDoc = firestore.collection('calls').doc(callId);
    const answerCandidates = callDoc.collection('answerCandidates');

    pc.onicecandidate = event => {
        event.candidate && answerCandidates.add(event.candidates.toJSON());
    }

    const callData = (await callDoc.get()).data();

    const offerDescription = callData.offer;
    await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

    const answerDescription = await pc.createAnswer();
    await pc.setLocalDescription(answerDescription);

    const answer = {
        type: answerDescription.type,
        sdp: answerDescription.sdp,
    };

    await callDoc.update({ answer });
};