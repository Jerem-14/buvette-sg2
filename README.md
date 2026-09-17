# La Buvette · ESJ

Application web pour suivre la cagnotte, les marchandises et les soirées d’une équipe. Next.js 16, React 19, TypeScript, App Router, Tailwind CSS 4 et **Redis Upstash uniquement**, selon le choix confirmé. Aucun paiement, prix de vente, chiffre d’affaires ou système de caisse.

## Démarrage immédiat

Node.js 20.9 minimum (Node.js 22 LTS recommandé pour le déploiement).

```sh
npm install
npm run dev
```

Ouvrir [localhost:3000](http://localhost:3000). Sans variables Redis, le serveur de développement propose une démonstration locale persistée dans `.data/register.json` :

- Email : `demo@buvette.local`
- Mot de passe : `Buvette-demo-2026!`

Les champs sont préremplis uniquement dans cette démonstration. Les sessions locales sont en mémoire et expirent au redémarrage. Le fichier de démonstration n’est pas adapté à plusieurs processus ; le serveur de production exige Redis et n’utilise jamais cet adaptateur.

## Fonctionnalités

- Connexion sécurisée, déconnexion et rôles ADMIN/MEMBER préparés.
- Dashboard : fonds reçus, contributeurs, stock disponible, alertes, consommation réelle, couverture, moyenne par soirée, écarts consommation et achats.
- Participants, contributions et produits : création, consultation, modification et suppression avec confirmation.
- Suppression réelle des produits/participants jamais utilisés ; archivage et réactivation des autres, sans perte des contributions ni du stock.
- Entrées de stock avec plusieurs produits et prix d’achat propres à chaque lot ; modification et annulation.
- Soirées ouvertes/clôturées, sorties, retours fractionnés et consommation automatiquement calculée.
- Correction des sorties et retours, y compris après clôture, sous réserve de préserver la cohérence des mouvements suivants.
- Historique filtrable par période, produit, participant, soirée et type ; journal avant/après des opérations.
- Export JSON des données métier et de l’audit (administrateur). Les mots de passe ne figurent pas dans l’export de l’interface.
- Interface française responsive, navigation mobile, formulaires accessibles au clavier et montants en euros.

## Architecture et schéma

Voir [la définition préalable de l’architecture](docs/architecture.md), [le schéma Redis](docs/redis-schema.md) et [les types TypeScript](src/lib/types.ts).

```text
src/app/                 Pages serveur et API authentifiées
src/components/          Dashboard, listes, formulaires et détails
src/lib/domain.ts        Commandes validées et reconstruction du registre
src/lib/money.ts         Montants et quantités fixes, calculs BigInt
src/lib/store.ts         Redis atomique et adaptateur local de démonstration
src/lib/auth.ts          Sessions, cookies, origine et limitation des connexions
src/lib/password.ts      Hash scrypt salé
src/lib/demo.ts          Jeu de données cohérent
scripts/database.ts      Initialisation et migration versionnée
tests/                   Scénarios métier, sécurité et parcours navigateur
```

Le registre métier complet tient dans une clé Redis. Une mutation lit la révision, applique une commande, reconstruit et valide le stock, puis utilise Lua pour ne sauvegarder que si la révision n’a pas changé. Après conflit, la commande est recalculée sur le registre courant, jusqu’à huit tentatives. Le registre et l’audit sont ainsi écrits ensemble. Les utilisateurs et le journal ne sont jamais envoyés avec les hashes de mots de passe dans l’API de l’interface.

Cette stratégie est dimensionnée pour **une équipe**. L’écriture est refusée à 4 Mo, sans perte de données. L’historique complet est conservé, et le registre est relu/reconstruit à chaque mutation. Pour plusieurs équipes ou des années de gros volume, prévoir une partition du registre et un journal dédié. Le chargement de l’historique côté interface se fait par groupes de 50, mais l’API du MVP transmet le registre métier entier.

## Règles de calcul

Les montants sont stockés en **centimes entiers** et les quantités en **milli-unités** : 1 bouteille = 1000 ; une demi-bouteille = 500. Les saisies acceptent une virgule ou un point, deux décimales pour les euros, trois pour les quantités. Les multiplications et répartitions financières utilisent BigInt ; aucun montant en euros n’est représenté par un flottant.

| Indicateur          | Calcul                                                   |
| ------------------- | -------------------------------------------------------- |
| Fonds reçus         | Somme des contributions actives                          |
| Stock disponible    | Entrées − sorties + retours                              |
| Consommation réelle | Sorti − retourné, seulement pour les soirées clôturées   |
| Écart consommation  | Fonds − coût de consommation réelle                      |
| Couverture          | Fonds / consommation × 100 ; « — » si consommation nulle |
| Écart achats        | Fonds − valeur totale des entrées                        |
| Moyenne par soirée  | Consommation / nombre de soirées clôturées               |

La valorisation suit **FIFO**, dans l’ordre d’enregistrement des entrées. La date de l’opération est descriptive et sert aux filtres ; modifier cette date ne réordonne pas les mouvements. Chaque lot conserve son prix réel. Le total d’un lot fractionné est arrondi au centime à l’entrée ; un prélèvement conserve les centimes restants sur le reliquat. Les retours réintègrent les reliquats des lots sortis, au coût d’origine. Ainsi :

```text
Valeur des achats = stock disponible + réservations ouvertes + consommation clôturée
```

Exemple : 500 € reçus, 600 € achetés, 400 € consommés, 200 € encore disponibles. Écart consommation : **+100 €**, couverture **125 %**, écart achats : **−100 €**.

**Un déficit ne bloque jamais une entrée.** Une sortie insuffisamment approvisionnée est refusée. La clôture ne diminue pas une seconde fois le stock. Les retours sont compris entre zéro et la quantité sortie.

Les corrections historiques recalculent la valorisation des mouvements dépendants. Une correction ne peut pas provoquer de stock négatif dans le passé. Corriger ou annuler d’abord les sorties en aval lorsque nécessaire. L’état original et l’auteur restent dans le journal.

## Configurer Redis Upstash

Créer une base Redis Upstash persistante, puis copier `.env.example` vers `.env.local` et renseigner :

```dotenv
UPSTASH_REDIS_REST_URL=https://votre-base.upstash.io
UPSTASH_REDIS_REST_TOKEN=votre-token-lecture-ecriture
REDIS_KEY_PREFIX=buvette
APP_URL=http://localhost:3000
ADMIN_EMAIL=responsable@example.fr
ADMIN_NAME=Responsable
ADMIN_PASSWORD=une-longue-phrase-secrete
```

Ces valeurs restent exclusivement côté serveur, sans préfixe `NEXT_PUBLIC_`. Le compte administrateur est créé par le seed ; les variables `ADMIN_*` ne donnent pas directement accès à l’application et ne sont pas nécessaires au fonctionnement après initialisation. Le mot de passe doit contenir entre 12 et 256 caractères.

```sh
# Initialise une base vide et le compte administrateur
npm run db:seed

# OU initialise un nouveau registre avec des données de démonstration
npm run db:seed -- --demo

# Vérifie la version et applique le parcours de migration
npm run db:migrate
```

Le seed utilise `SET NX` et **ne remplace jamais un registre existant**. La version initiale du schéma est 1 ; aucune transformation n’est nécessaire pour cette première version. Les versions inconnues sont refusées plutôt que converties silencieusement. Il n’y a ni PostgreSQL ni migration SQL.

Utiliser des préfixes distincts pour le développement et la production. Le mode local ne se synchronise pas automatiquement avec Upstash. Le registre persistant n’a pas de TTL ; éviter toute politique d’éviction susceptible de supprimer des données métier.

## Authentification

Les mots de passe sont hashés par scrypt avec sel aléatoire. Les tokens de session aléatoires (256 bits) ne sont placés que dans un cookie `HttpOnly`, `SameSite=Lax`, `Secure` en production. Leur empreinte SHA-256 sert de clé Redis avec expiration absolue de sept jours. La déconnexion supprime la session côté serveur.

L’origine des mutations doit correspondre à `APP_URL`. Les tentatives de connexion sont limitées de façon atomique à 10 par compte et 100 globalement sur quinze minutes. Une panne Redis bloque l’authentification et les mutations. Les autorisations sont vérifiées dans l’API et le domaine. Les membres peuvent enregistrer des opérations et clôturer une soirée ouverte ; corrections et suppressions demandent ADMIN. Le MVP crée un seul administrateur et ne comporte pas encore d’écran de gestion des comptes.

## Déploiement Vercel

1. Publier ce dossier dans un dépôt Git, puis importer le dépôt dans Vercel avec le preset **Next.js** et Node.js 22.
2. Ajouter les variables Redis, `REDIS_KEY_PREFIX` et `APP_URL` dans l’environnement Production. `APP_URL` doit être l’origine HTTPS exacte du domaine utilisé, sans chemin. Un accès par une autre origine est refusé pour les mutations.
3. Initialiser une seule fois la base de production via `npm run db:seed` depuis un environnement sécurisé, avec ses variables `ADMIN_*`.
4. Exécuter `npm run db:migrate`, puis `npm test` et `npm run build`.
5. Déployer. Vercel utilise `npm run build` ; aucune donnée n’est créée pendant le build.
6. Vérifier la connexion, une entrée, une contribution et une clôture depuis le domaine définitif.

Les déploiements Preview doivent utiliser un préfixe distinct et leur propre `APP_URL`. Les cookies de production exigent HTTPS. Aucun secret réel n’est fourni dans ce dépôt et aucun déploiement n’est effectué automatiquement.

## Tests et qualité

```sh
npm run typecheck
npm test
npm run build

# Chromium doit être installé une fois
npm exec playwright -- install chromium
npm run test:e2e
```

Les tests métier couvrent les montants exacts, le déficit autorisé, la séparation achats/stock/consommation, FIFO, les retours fractionnés, les centimes résiduels, le stock négatif, les corrections historiques, l’archivage et les rôles. Un scénario de 100 cycles vérifie la conservation des quantités et des centimes.

Les tests navigateur lancent leur serveur de développement sur le port 3100, forcent le mode local sans Redis et écrivent dans `.data/playwright/register.json`. Ils créent des données de test, vérifient un parcours mobile complet et envoient deux sorties concurrentes pour une seule unité disponible. Arrêter votre serveur `npm run dev` avant les tests : Next.js partage le dossier de compilation. Les sept pages sont aussi contrôlées à 390 pixels de largeur. La connexion REST et le script Lua Upstash doivent également être vérifiés sur votre base configurée avant une mise en service ; les tests locaux ne prouvent pas la disponibilité du service externe.

## Sauvegarde

Le bouton d’export dans Historique fournit une copie métier en JSON sans les comptes. Configurer aussi les sauvegardes du service Redis pour pouvoir restaurer le registre complet, y compris les comptes. Une restauration complète doit être faite hors écriture, dans un nouveau préfixe, en validant le schéma et le registre avant bascule. Le MVP n’expose pas d’import destructif dans l’interface.

## Références techniques

- [Installation Next.js](https://nextjs.org/docs/app/getting-started/installation)
- [SDK TypeScript Redis Upstash](https://upstash.com/docs/redis/sdks/ts/overview)
- [Scripts Lua avec Upstash](https://upstash.com/docs/redis/sdks/ts/commands/scripts/eval)
