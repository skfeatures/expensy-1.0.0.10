// 1. Import Firebase & IndexedDB libraries directly into the background worker
importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-auth-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore-compat.js');
importScripts('https://cdn.jsdelivr.net/npm/idb-keyval@6/dist/umd.js');

// 2. Cache Versioning 
const CACHE_NAME = 'budget-store-v9'; 
const STORAGE_KEY = 'budget_data_main';

// 3. Add your exact Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyDVr6AE4xxwW9l1mmhDLyaE2yq3JW6CoNg",
    authDomain: "expensy-note.firebaseapp.com",
    projectId: "expensy-note",
    storageBucket: "expensy-note.firebasestorage.app",
    messagingSenderId: "1007369333200",
    appId: "1:1007369333200:web:e755f04949508cf93a71d5",
    measurementId: "G-9MBMJZ2SWE"
};

// 4. Initialize Firebase in the background
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const auth = firebase.auth();

// 5. Install Setup
self.addEventListener('install', (e) => {
    self.skipWaiting(); 
    e.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
          return cache.addAll([
              './',
              './index.html', 
              './manifest.json',
              './icon.png',
              './bookman.ttf',
              './lipishree.ttf' 
          ]);
      })
    );
});

// 6. Activate Event
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 7. Fetch Setup 
self.addEventListener('fetch', (event) => {
    if (event.request.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const networkResponse = await fetch(event.request, { cache: 'no-store' });
                const cache = await caches.open(CACHE_NAME);
                event.waitUntil(cache.put(event.request, networkResponse.clone()));
                return networkResponse;
            } catch (error) {
                const cachedResponse = await caches.match(event.request);
                if (cachedResponse) {
                    return cachedResponse;
                }
                throw error;
            }
        })());
        return;
    }

    event.respondWith((async () => {
        try {
            const networkResponse = await fetch(event.request);
            const cache = await caches.open(CACHE_NAME);
            event.waitUntil(cache.put(event.request, networkResponse.clone()));
            return networkResponse;
        } catch (error) {
            const cachedResponse = await caches.match(event.request);
            if (cachedResponse) {
                return cachedResponse;
            }
            throw error;
        }
    })());
});

// 8. The standard Sync Event for immediate upload when network returns
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-expenses') {
        console.log('Network is back! Background sync started.');
        event.waitUntil(syncDataToFirestore());
    }
});

// 9. Process IndexedDB Data and push to Firestore
async function syncDataToFirestore() {
    return new Promise((resolve, reject) => {
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
            unsubscribe(); // শুধুমাত্র একবার চেক করার জন্য
            if (user) {
                try {
                    // IndexedDB থেকে লেটেস্ট ডাটা রিড করা হচ্ছে
                    const data = await idbKeyval.get(STORAGE_KEY);
                    if (data) {
                        await db.collection('userData').doc(user.uid).set({
                            budgetsArray: data.budgetsArray || [],
                            expensesArray: data.expensesArray || [],
                            localDataVersion: data.localDataVersion || 0,
                            deletedSyncIds: data.deletedSyncIds || [],
                            globalResetTime: data.globalResetTime || 0,
                            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });
                        console.log("Background sync to Firestore successful!");
                    }
                    resolve();
                } catch (error) {
                    console.error("Background sync failed:", error);
                    reject(error);
                }
            } else {
                console.log("No user authenticated in background. Skipping sync.");
                resolve();
            }
        });
    });
}