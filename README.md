# Rendu tp ar Timothée Héraud

Ce rendu est une petite adaptation du rendu fait pour le cours de WEBGL ([voir ici](https://github.com/Timoonz/castlebuilder)).

Il reprend certaines des mécaniques (plateforme, pièce qui tombe, son...) sans reprendre les mécanismes de jeu (par manque de temps).

L'idée aurait été d'ajouter de la collision avec les objets réels, de la spatialisation audio et de la lumière ambiante, mais j'ai manqué de temps.

Au lancement de l'application, l'utilisateur place la plateforme à l'aide du réticules, puis fait tomber les pièces en touchant l'écran (normalement les pièces tombent là où le joueur clique, mais ce n'est paas tout à fait le cas à cause de hittest visiblement, je n'ai pas eu le temps de trouver une meilleure implémentation).

# Screenshot 

<img width="917" height="2048" alt="image" src="https://github.com/user-attachments/assets/db358a44-2034-42a9-8843-61d167e163a4" />



# Demo live

Lien vers la [demo live](https://timoonz.github.io/tp_ar/)

# Exemples/inspirations

Pour le [setup de base de WEBXR](https://threejs.org/examples/?q=webxr#webxr_ar_cones)  

Pour le [rétuticule et le hittest](https://threejs.org/examples/?q=webxr#webxr_ar_hittest)

Pour la [spatialisation audio](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Web_audio_spatialization_basics) (que je n'ai pas réussi à faire fonctionner à cause de problèmes de contexte audio): 
