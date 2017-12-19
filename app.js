firebase.initializeApp({
    messagingSenderId: '893318301019'
});

var messaging;


var bt_register = $('#register');
var bt_delete = $('#delete');
var token = $('#token');
var form = $('#notification');

var info = $('#info');
var info_message = $('#info-message');

var alert = $('#alert');
var alert_message = $('#alert-message');
var close_alert = $('#close_alert');

const safariWebServiceURL = 'https://beacon.konturlabs.com/api/v2/apns';
const safariWebsitePushId = 'web.com.disasteralertnetworkllc.disasteralert';

close_alert.on('click', function () {
    alert.hide();
    alert_message.html('');
});

resetUI();

if (isSafari()) {
    document.title = 'APNS web push notifications';
    $('#title').text('APNS web push notifications');
    startWithSafari();
} else {
    document.title = 'FCM web push notifications';
    $('#title').text('FCM web push notifications');
    if (window.location.protocol === 'https:'
            && 'Notification' in window
            && 'serviceWorker' in navigator
            && 'localStorage' in window
            && 'fetch' in window
            && 'postMessage' in window) {
        startWithFirebase();
    } else {
        showDetectedProblemsInfo();
    }
}

function showDetectedProblemsInfo() {
    if (window.location.protocol !== 'https:') {
        showError('Is not from HTTPS');
    } else if (!('Notification' in window)) {
        showError('Notification not supported');
    } else if (!('serviceWorker' in navigator)) {
        showError('ServiceWorker not supported');
    } else if (!('localStorage' in window)) {
        showError('LocalStorage not supported');
    } else if (!('fetch' in window)) {
        showError('fetch not supported');
    } else if (!('postMessage' in window)) {
        showError('postMessage not supported');
    }
    
    console.warn('This browser does not support desktop notification.');
    console.log('Is HTTPS', window.location.protocol === 'https:');
    console.log('Support Notification', 'Notification' in window);
    console.log('Support ServiceWorker', 'serviceWorker' in navigator);
    console.log('Support LocalStorage', 'localStorage' in window);
    console.log('Support fetch', 'fetch' in window);
    console.log('Support postMessage', 'postMessage' in window);
    
    updateUIForPushPermissionRequired();
}

function startWithFirebase() {
    messaging = firebase.messaging();
    
    // already granted
    if (Notification.permission === 'granted') {
        getToken();
    }
    
    // get permission on subscribe only once
    bt_register.on('click', function () {
        getToken();
    });
    
    bt_delete.on('click', function () {
        // Delete Instance ID token.
        messaging.getToken()
            .then(function (currentToken) {
                messaging.deleteToken(currentToken)
                    .then(function () {
                        console.log('Token deleted.');
                        setTokenSentToServer(false);
                        // Once token is deleted update UI.
                        resetUI();
                    })
                    .catch(function (error) {
                        showError('Unable to delete token.', error);
                    });
            })
            .catch(function (error) {
                showError('Error retrieving Instance ID token.', error);
            });
    });
    
    // handle catch the notification on current page
    messaging.onMessage(function (payload) {
        console.log('Message received. ', payload);
        payload.notification.icon = "https://beacon.konturlabs.com/api/v2/images/logo.png";
        payload.notification.click_action = "http://www.pdc.org/";
        info.show();
        info_message
            .text('')
            .append('<strong>' + payload.notification.title + '</strong>')
            .append('<em> ' + payload.notification.body + '</em>')
        ;
        
        // register fake ServiceWorker for show notification on mobile devices
        navigator.serviceWorker.register('/serviceworker/messaging-sw.js');
        Notification.requestPermission(function (permission) {
            if (permission === 'granted') {
                navigator.serviceWorker.ready.then(function (registration) {
                    payload.notification.data = payload.notification;
                    
                    registration.showNotification(payload.notification.title, payload.notification);
                }).catch(function (error) {
                    // registration failed :(
                    showError('ServiceWorker registration failed.', error);
                });
            }
        });
    });
    
    // Callback fired if Instance ID token is updated.
    messaging.onTokenRefresh(function () {
        messaging.getToken()
            .then(function (refreshedToken) {
                console.log('Token refreshed.');
                // Send Instance ID token to app server.
                sendTokenToServer(refreshedToken);
                updateUIForPushEnabled(refreshedToken);
            })
            .catch(function (error) {
                showError('Unable to retrieve refreshed token.', error);
            });
    });
}

function isSafari() {
    return ('safari' in window);
}

function startWithSafari() {
    if ('safari' in window && 'pushNotification' in window.safari) {
        bt_register.on('click', function () {
            bt_register.attr('disabled', 'disabled');
            safariPushNotificationRequest();
        });
    } else {
        showError('Push notifications not supported.');
    }
}

function safariPushNotificationRequest() {
    var permissionData = window.safari.pushNotification.permission(safariWebsitePushId);
    checkRemotePermission(permissionData);
};

var checkRemotePermission = function (permissionData) {
    if (permissionData.permission === 'default') {
        console.log("The user is making a decision");
        window.safari.pushNotification.requestPermission(
            safariWebServiceURL,
            safariWebsitePushId,
            {"id": "75c88aaa-c32f-4d41-ab11-ecc556494051"},
            checkRemotePermission
        );
    }
    else if (permissionData.permission === 'denied') {
        console.dir(arguments);
        showError('Push notification denied');
        bt_register.removeAttr('disabled');
    }
    else if (permissionData.permission === 'granted') {
        token.text(permissionData.deviceToken);
        bt_register.hide();
    }
};

function getToken() {
    messaging.requestPermission()
        .then(function () {
            // Get Instance ID token. Initially this makes a network call, once retrieved
            // subsequent calls to getToken will return from cache.
            messaging.getToken()
                .then(function (currentToken) {
                    
                    if (currentToken) {
                        sendTokenToServer(currentToken);
                        updateUIForPushEnabled(currentToken);
                    } else {
                        showError('No Instance ID token available. Request permission to generate one.');
                        updateUIForPushPermissionRequired();
                        setTokenSentToServer(false);
                    }
                })
                .catch(function (error) {
                    showError('An error occurred while retrieving token.', error);
                    updateUIForPushPermissionRequired();
                    setTokenSentToServer(false);
                });
        })
        .catch(function (error) {
            showError('Unable to get permission to notify.', error);
        });
}

// Send the Instance ID token your application server, so that it can:
// - send messages back to this app
// - subscribe/unsubscribe the token from topics
function sendTokenToServer(currentToken) {
    if (!isTokenSentToServer(currentToken)) {
        console.log('Sending token to server...');
        // send current token to server
        //$.post(url, {token: currentToken});
        setTokenSentToServer(currentToken);
    } else {
        console.log('Token already sent to server so won\'t send it again unless it changes');
    }
}

function isTokenSentToServer(currentToken) {
    return window.localStorage.getItem('sentFirebaseMessagingToken') == currentToken;
}

function setTokenSentToServer(currentToken) {
    if (currentToken) {
        window.localStorage.setItem('sentFirebaseMessagingToken', currentToken);
    } else {
        window.localStorage.removeItem('sentFirebaseMessagingToken');
    }
}

function updateUIForPushEnabled(currentToken) {
    console.log(currentToken);
    token.text(currentToken);
    bt_register.hide();
    bt_delete.show();
}

function resetUI() {
    token.text('');
    bt_register.show();
    bt_delete.hide();
}

function updateUIForPushPermissionRequired() {
    bt_register.attr('disabled', 'disabled');
    resetUI();
}

function showError(error, error_data) {
    if (typeof error_data !== "undefined") {
        console.error(error + ' ', error_data);
    } else {
        console.error(error);
    }
    
    alert.show();
    alert_message.html(error);
}
