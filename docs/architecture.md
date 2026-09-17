# Architecture du MVP — Buvette d’équipe

## 1. Organisation

Next.js App Router, TypeScript strict, Tailwind CSS. Pages serveur protégées et interface interactive côté client. Une API authentifiée expose une lecture cohérente et des commandes métier validées par Zod. Le domaine est indépendant de Next.js et du stockage et possède des tests de scénarios.

Redis Upstash est l’unique base, conformément au choix confirmé. Un registre JSON versionné contient les collections métier et le journal d’audit. Une commande Lua compare la révision puis remplace atomiquement le registre ; en cas de conflit, la commande métier est rejouée sur la nouvelle version. Redis conserve aussi les sessions révocables et limite les connexions. Un adaptateur fichier réservé au développement local permet une démonstration sans services externes.

Répertoires : `src/app` (pages et API), `src/components` (interface), `src/lib` (domaine, stockage, sécurité et migrations versionnées), `scripts` (migration et seed), `tests` (règles métier).

## 2. Entités et relations

- User : id, email unique, name, passwordHash, role ADMIN/MEMBER.
- Participant : id, name, archived, dates. 1 → N Contribution.
- Contribution : id, participantId, amountCents, date, note, dates.
- Product : id, name, category, purchasePriceCents, lowStockThreshold (milli-unités), archived, dates. Le stock n’est pas stocké.
- StockEntry : id, date, note, sequence, dates. 1 → N StockEntryItem.
- StockEntryItem : id, stockEntryId, productId, quantity (milli-unités), unitPriceCents.
- BuvetteSession : id, name, date, note, status OPEN/CLOSED, closeSequence nullable, dates. 1 → N ConsumptionMovement.
- ConsumptionMovement : id, eventId, productId, quantityOut, quantityReturned, sequence, dates. Consommé = sorti − retourné uniquement après clôture. Le coût provient des allocations FIFO reconstruites, plutôt que d’un prix moyen arrondi.
- AuditLog : id, actorId, type, entityId, date, note, before/after JSON. Conserve les opérations originales et les corrections/suppressions.

Les validations du domaine protègent les références entre collections, dans la même écriture atomique. Une suppression est physique si l’entité n’a jamais été utilisée ; sinon le participant ou produit est archivé. Les contributions, entrées et soirées supprimées restent consultables dans le journal d’audit. Un produit archivé avec du stock reste disponible dans la gestion du stock et des soirées ; l’archivage masque seulement le catalogue actif et bloque les nouveaux achats.

## 3. Stock et valorisation

Montants persistés en centimes entiers sûrs ; multiplication et répartition effectuées avec BigInt. Quantités persistées en milli-unités entières (1 bouteille = 1000). Aucune représentation flottante des montants en euros. Une valeur de lot est arrondie au centime à l’entrée ; chaque prélèvement répartit les centimes du lot et conserve exactement son reliquat.

Stock disponible = entrées − sorties + retours. Une clôture n’enlève pas une seconde fois les produits consommés. La formule ambiguë de la demande est donc interprétée comme « entrées − sorties + retours », ou, après clôture de toutes les soirées, « entrées − consommation réelle ».

FIFO : les lots sont prélevés dans l’ordre d’enregistrement. La date métier est descriptive ; une correction ne réordonne pas silencieusement le registre. Les retours réintègrent le reliquat des lots prélevés. La valeur des achats se décompose exactement en stock disponible + marchandises sorties pour des soirées ouvertes + consommation clôturée.

Chaque commande reconstruit et valide tout le registre avant l’écriture atomique. Une correction qui provoquerait un stock négatif, même à une étape historique, est rejetée avec explication. Les opérations liées doivent d’abord être corrigées/annulées en aval. Le contrôle optimiste de révision évite la double réservation lors de requêtes concurrentes. Cette stratégie simple convient au volume d’une équipe ; une limite de taille explicite invite à faire évoluer le stockage avant de dépasser la taille maximale d’une requête Upstash.

## 4. Indicateurs

- Fonds reçus = somme des contributions actives.
- Achats = somme des valeurs des lots entrés.
- Consommation = coûts FIFO des quantités réellement consommées dans les soirées clôturées.
- Écart consommation = fonds − consommation.
- Couverture = fonds / consommation × 100 ; affichage « — » si consommation nulle.
- Écart achats = fonds − achats ; déficit autorisé et affiché.
- Stock = valeur des lots disponibles ; réservations affichées séparément.
- Moyenne = consommation / nombre de soirées clôturées, arrondie au centime.
- Contributeurs = participants distincts ayant au moins une contribution.

## 5. Cycle d’une soirée

1. Création OPEN avec nom, date et note.
2. Ajout d’une ou plusieurs sorties ; réservation immédiate, jamais au-delà du stock disponible.
3. Modification/annulation des lignes si le registre reste cohérent.
4. Clôture : saisie des retours pour chaque ligne, compris entre zéro et la sortie ; le complément est consommé, les retours réintègrent le stock.
5. Correction des retours après clôture, ou annulation de la soirée, possible avec journal d’audit et revalidation de tous les mouvements suivants.

## 6. Sécurité et déploiement

Authentification email/mot de passe, hash scrypt salé, cookie HttpOnly SameSite=Lax Secure en production, session aléatoire avec expiration absolue de sept jours. Rôle contrôlé sur le serveur ; les suppressions et corrections sont réservées à ADMIN. Contrôle d’origine sur les mutations. Limitation atomique des connexions dans Redis. Aucun compte ou mot de passe de démonstration accepté en production.

Vercel : runtime Node.js, Redis Upstash REST, schéma `schemaVersion: 1`, migration explicite et idempotente du registre. Aucun seed automatique en production. Les intégrations externes nécessitent les variables de l’exploitant. Les clés utilisent un préfixe configurable : `registre`, `session:<sha256>`, `login:<sha256>`. Le registre et son audit n’ont pas de TTL ; les sessions expirent à sept jours et les compteurs de connexion à quinze minutes.

## 7. Étapes d’implémentation

1. Socle, schéma Redis et moteur métier testé.
2. Persistance, authentification, API et données de démonstration.
3. Dashboard, cagnotte, catalogue, participants et stock.
4. Soirées, retours, corrections et historique filtrable.
5. Vérification TypeScript, tests métier, build et documentation de déploiement.
