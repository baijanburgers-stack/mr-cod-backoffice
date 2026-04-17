const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, updateDoc, deleteField } = require('firebase/firestore');
const config = require('./firebase-applet-config.json');

const app = initializeApp(config);
const db = getFirestore(app);

async function purge() {
  console.log('Starting explicit purge of legacy keys from all stores...');
  const snapshot = await getDocs(collection(db, 'stores'));
  for (let docSnap of snapshot.docs) {
    try {
      console.log('Purging ghost keys from store:', docSnap.id);
      await updateDoc(docSnap.ref, {
        'vatSettings.takeawayRate': deleteField(),
        'vatSettings.dineInRate': deleteField(),
        'vatSettings.drinksRate': deleteField(),
      });
    } catch(e) {
      console.log('Failed for', docSnap.id, e.message);
    }
  }
  console.log('Successfully destroyed ghost keys forever!');
  process.exit();
}

purge();
