# Baby-Tracker im Google Play Store – Vorbereitung

Die App bleibt eine Web-App. Für den Play Store wird sie als **Trusted Web Activity (TWA)** verpackt:
eine kleine Android-Hülle, die die Web-App im Vollbild ohne Browserleiste anzeigt. Updates der Web-App
(GitHub Pages) kommen dadurch automatisch auch in der Play-Store-Version an – neu hochladen muss man nur,
wenn sich an der Hülle selbst etwas ändert (Name, Symbol, Version, Berechtigungen).

> ⚠️ **Signierschlüssel (`*.jks`, `*.keystore`) und Passwörter niemals in dieses Verzeichnis legen.**
> Das Repository ist öffentlich. Die `.gitignore` im Hauptverzeichnis schließt solche Dateien aus,
> trotzdem: Schlüssel an einem sicheren Ort außerhalb des Repos aufbewahren (und eine Sicherungskopie!).

## Inhalt dieses Verzeichnisses

| Datei | Zweck |
|---|---|
| `README.md` | diese Checkliste |
| `twa-manifest.json` | Vorlage für das Verpackungs-Werkzeug **Bubblewrap** (Paketname, Farben, Symbole, Schnellaktionen) |
| `assetlinks.json.vorlage` | Vorlage für die „Digital Asset Links“-Datei, die beweist, dass App und Website zusammengehören |
| `store-eintrag.md` | Entwurf für Titel, Beschreibungen, Kategorie und das Datensicherheits-Formular |
| `datenschutz-entwurf.md` | Entwurf der Datenschutzerklärung (vom Play Store verlangt) |

## Schritt für Schritt

### 1. Entscheidungen treffen
- [ ] **Paketname** festlegen, z. B. `de.<deinname>.babytracker` – kann nach der Veröffentlichung **nie mehr** geändert werden.
- [ ] **Eigene Domain** (empfohlen), z. B. `babytracker-app.de`, statt `wirmachenkeinemusikgmbh-lang.github.io`.
      Gründe: Die Asset-Links-Datei muss im **Wurzelverzeichnis der Domain** liegen (`/.well-known/assetlinks.json`),
      bei einer GitHub-Projektseite geht das nur über ein zusätzliches Repository `wirmachenkeinemusikgmbh-lang.github.io`.
      Außerdem steht die Adresse im Store-Eintrag und in der Datenschutzerklärung.
      Eine eigene Domain lässt sich in GitHub Pages unter *Settings → Pages → Custom domain* eintragen.
- [ ] **App-Name** im Store prüfen („Baby-Tracker“ ist sehr wahrscheinlich schon vergeben – Vorschläge in `store-eintrag.md`).

### 2. Konten & Rechtliches
- [ ] **Google-Play-Entwicklerkonto** anlegen (einmalig 25 US-$). Für private Konten verlangt Google eine Identitätsprüfung.
- [ ] Bei **neuen privaten Konten**: vor der Veröffentlichung ein **geschlossener Test** mit mindestens 12 Testern über 14 Tage
      (z. B. Familie und Freunde mit Android-Handy). Die genauen Bedingungen stehen in der Play Console.
- [ ] **Datenschutzerklärung** fertigstellen (`datenschutz-entwurf.md`) und unter einer öffentlichen Adresse veröffentlichen.
- [ ] **Impressum/Kontakt**: Google zeigt Entwickler-Name, E-Mail und ggf. Adresse öffentlich im Store an.

### 3. App verpacken – Variante A: PWABuilder (am einfachsten, läuft im Browser)
1. <https://www.pwabuilder.com> öffnen, die App-Adresse eingeben.
2. *Package for stores → Android* wählen, Paketname, App-Name und Version eintragen.
   Die Werte aus `twa-manifest.json` können übernommen werden.
3. PWABuilder erstellt ein ZIP mit dem **App-Bundle (.aab)**, dem **Signierschlüssel** und einer fertigen `assetlinks.json`.
   → Den Schlüssel und die Passwort-Datei **sofort sicher ablegen**, nicht ins Repo!

### 3. App verpacken – Variante B: Bubblewrap (Kommandozeile)
Braucht Node.js; Bubblewrap installiert Java und das Android-SDK beim ersten Start selbst.
```
npm i -g @bubblewrap/cli
bubblewrap init --manifest=https://<adresse>/manifest.webmanifest
bubblewrap build
```
Als Vorlage für die Fragen bei `init` dient `twa-manifest.json`.

### 4. Website und App verbinden (Digital Asset Links)
- [ ] SHA-256-Fingerabdruck des Signierschlüssels besorgen – **nach dem ersten Hochladen den aus der Play Console**
      (*Einrichten → App-Integrität → App-Signatur*), denn Google signiert die App mit einem eigenen Schlüssel.
- [ ] `assetlinks.json.vorlage` ausfüllen und als `https://<domain>/.well-known/assetlinks.json` veröffentlichen.
- [ ] Prüfen: Die App startet **ohne Browserleiste**. Erscheint oben eine Adressleiste, stimmen die Asset Links noch nicht.

### 5. Play Console
- [ ] App anlegen, Store-Eintrag ausfüllen (`store-eintrag.md`): Symbol 512×512 (vorhanden: `icons/icon-512.png`),
      Vorschaugrafik 1024×500, mindestens 2 Screenshots vom Handy.
- [ ] **App-Inhalte**: Datenschutzerklärung (URL), Datensicherheit, Zielgruppe (**ab 18** – die App richtet sich an Eltern,
      nicht an Kinder), Inhaltsbewertung (Fragebogen), Gesundheits-App-Erklärung, Werbung: keine.
- [ ] Geschlossenen Test starten → nach Freigabe Produktion.

## Was die Web-App dafür schon mitbringt
- ✅ Manifest mit Name, Farben, Symbolen (auch „maskable“), `id`, Kategorien
- ✅ Service Worker (offline nutzbar) – Voraussetzung für TWA
- ✅ App-Schnellaktionen (`shortcuts` im Manifest) – werden zu Android-App-Verknüpfungen
- ✅ Mitteilungen mit Knöpfen – in der TWA mit `enableNotifications: true` als App-Mitteilungen
- ⏳ eigene Domain, Datenschutzerklärung, Store-Grafiken, Asset Links

## Später möglich
Mit der Android-Hülle gibt es ein echtes Android-Projekt. Darin ließe sich später ein **natives Startbildschirm-Widget**
ergänzen, dessen Knöpfe die vorhandenen Schnellaktions-Links (`?quick=…`) öffnen. Ein Sperrbildschirm-Widget
hängt zusätzlich vom Handy-Hersteller ab.
