// Importer les modules nécessaires
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, deleteDoc, doc } = require('firebase/firestore');

// Configuration Firebase copiée depuis lib/firebase.ts
const firebaseConfig = {
  apiKey: "AIzaSyAwo15HISsZSO3VvkPB6lyPOrXN6hozycI",
  authDomain: "gestapp2-879ac.firebaseapp.com",
  projectId: "gestapp2-879ac",
  storageBucket: "gestapp2-879ac.firebasestorage.app",
  messagingSenderId: "280996040024",
  appId: "1:280996040024:web:da724ae174bf3ef748e92d"
};

// Initialiser Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function deleteDuplicateTasks() {
  console.log("Recherche des tâches avec le titre 'Verification'...");
  
  try {
    // Rechercher toutes les tâches qui pourraient correspondre
    const tasksRef = collection(db, "tasks");
    const querySnapshot = await getDocs(tasksRef);
    
    if (querySnapshot.empty) {
      console.log("Aucune tâche trouvée dans la base de données.");
      return;
    }
    
    // Filtrer manuellement pour être plus souple sur les correspondances
    const taskTitle = "verification";
    const taskDesc = "toujours fouiller les poches de daniel quand il revien de sa marche";
    
    const matchingTasks = [];
    
    querySnapshot.forEach(doc => {
      const data = doc.data();
      
      // Normaliser le titre et la description (minuscules, pas d'espaces superflus)
      const name = (data.name || "").toLowerCase().trim();
      const description = (data.description || "").toLowerCase().trim();
      
      // Vérifier si le titre et la description correspondent approximativement
      if (name.includes(taskTitle) && 
          (description.includes(taskDesc) || 
           description.includes("daniel") && description.includes("fouiller") && description.includes("poche"))) {
        matchingTasks.push({ id: doc.id, data });
      }
    });
    
    console.log(`Nombre de tâches à supprimer: ${matchingTasks.length}`);
    
    // Lister les tâches trouvées
    matchingTasks.forEach((task, index) => {
      console.log(`${index + 1}. ID: ${task.id}, Titre: ${task.data.name}, Description: ${task.data.description}`);
    });
    
    // Supprimer chaque tâche
    let count = 0;
    for (const task of matchingTasks) {
      console.log(`Suppression de la tâche ID: ${task.id}`);
      await deleteDoc(doc(db, "tasks", task.id));
      count++;
    }
    
    console.log(`Suppression terminée. ${count} tâche(s) supprimée(s).`);
  } catch (error) {
    console.error("Erreur lors de la suppression des tâches:", error);
  }
}

// Exécuter la fonction principale
deleteDuplicateTasks()
  .then(() => console.log("Opération terminée"))
  .catch(err => console.error("Erreur:", err)); 