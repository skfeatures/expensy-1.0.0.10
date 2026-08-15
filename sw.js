// 1. Import Firebase & IndexedDB libraries directly into the background worker
importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-auth-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore-compat.js');
importScripts('https://cdn.jsdelivr.net/npm/idb-keyval@6/dist/umd.js');

// 2. Cache Versioning 
const CACHE_NAME = 'budget-store-v11'; 
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

// 7. Fetch Setup (Stale-While-Revalidate for Instant Startup)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                // নেটওয়ার্ক থেকে নতুন ডাটা পেলে ক্যাশ আপডেট করে নিবে
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, networkResponse.clone());
                });
                return networkResponse;
            }).catch((error) => {
                console.log('Offline: Using cache fallback.', error);
            });
            
            // যদি ক্যাশে ফাইল থাকে, তবে সাথে সাথে রিটার্ন করবে (Instant Load)
            // না থাকলে নেটওয়ার্কের জন্য অপেক্ষা করবে
            return cachedResponse || fetchPromise;
        })
    );
});

// 8. The standard Sync Event for immediate upload when network returns
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-expenses') {
        console.log('Network is back! Background sync started.');
        event.waitUntil(syncDataToFirestore());
    }
});

// 9. Process IndexedDB Data and push to Firestore with robust Auth handling
async function syncDataToFirestore() {
    return new Promise((resolve, reject) => {
        // ফায়ারবেস অথেনটিকেশন হ্যাং হয়ে গেলে যেন Service Worker ক্র্যাশ না করে, সেজন্য 15 সেকেন্ডের একটি সেফটি টাইমআউট
        const safetyTimeout = setTimeout(() => {
            console.log("Background sync Auth timeout. Will retry next time.");
            resolve(); // Reject না করে resolve করছি যেন ব্রাউজার প্রসেস কিল না করে
        }, 15000);

        const unsubscribe = auth.onAuthStateChanged(async (user) => {
            unsubscribe(); // ইভেন্ট লিসেনার রিমুভ করা হলো
            clearTimeout(safetyTimeout); // টাইমআউট ক্লিয়ার করা হলো

            if (user) {
                try {
                    // IndexedDB থেকে লেটেস্ট ডাটা রিড করা হচ্ছে
                    const data = await idbKeyval.get(STORAGE_KEY);
                    if (data) {
                        // ব্যাকগ্রাউন্ডে ফায়ারবেস নেটওয়ার্ক সচল করা হচ্ছে
                        await db.enableNetwork();
                        
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
                    reject(error); // ফেইল করলে ব্রাউজার পরবর্তীতে আবার ট্রাই করবে
                }
            } else {
                console.log("No user authenticated in background. Skipping sync.");
                resolve();
            }
        });
    });
}