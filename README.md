# VORTICE · Laboratorio di aerodinamica

**prof. B. Raucci**

Esportazione della webapp attuale, pronta per GitHub Pages o per un altro server statico. Include la scena Three.js, il passaggio dal 2D al 3D, i diagrammi delle velocità e delle forze, i temi, l'animazione del flusso presso le estremità e il controllo opzionale con le mani. Il comando **Etichette pressione** permette di mostrare o nascondere i richiami della pressione indipendentemente dalla colorazione e dai traccianti.

## Quali file caricare

`index.html` è la pagina di ingresso. Per far funzionare l'applicazione occorre mantenere **tutti i file e tutte le sottocartelle contenuti nello ZIP**. Il solo HTML non contiene il codice JavaScript, i fogli di stile, i font, Three.js o il modello per il riconoscimento delle gesture.

L'archivio contiene direttamente i file del sito: `index.html` deve trovarsi alla radice della cartella pubblicata, insieme ai file `.js` e `.css`, a `favicon.svg` e alle cartelle `assets/` e `vendor/`. Non cambiare nomi, maiuscole o struttura delle sottocartelle. Il file `.nojekyll` è incluso e può risultare nascosto nel gestore dei file.

Le dipendenze sono incluse localmente. Non sono necessari npm, una compilazione, un backend o chiavi API.

## Pubblicazione su GitHub Pages

1. Crea un repository su GitHub, per esempio `vortice`. GitHub Pages è disponibile per i repository pubblici con il piano GitHub Free.
2. Estrai `VORTICE_GitHub_Pages.zip` sul computer. Nel repository, usa **Add file → Upload files** e carica il contenuto estratto, comprese le sottocartelle e `.nojekyll`. Carica i file estratti, non l'archivio ZIP. Dopo il caricamento, verifica che `index.html` sia visibile alla radice del repository e salva le modifiche con un commit.
3. Apri **Settings → Pages**. In **Build and deployment → Source**, scegli **Deploy from a branch**.
4. Seleziona il branch che contiene i file, normalmente **main**, e la cartella **/(root)**. Premi **Save**.
5. Al termine della pubblicazione, apri il collegamento mostrato nella sezione Pages. Per un repository di progetto chiamato `vortice`, l'indirizzo abituale è `https://<utente>.github.io/vortice/`.

I percorsi delle risorse sono relativi: l'applicazione può funzionare anche nella sottocartella associata al nome del repository. Per successivi aggiornamenti, sostituisci insieme i file della nuova esportazione, conservando la struttura.

Documentazione ufficiale:

- [Configurare la sorgente di pubblicazione di GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Caricare file in un repository](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)

## Prova sul computer

Apri un terminale nella cartella estratta, quella che contiene `index.html`, ed esegui:

```bash
python3 -m http.server 8000
```

Quindi visita **http://localhost:8000** nel browser. Su Windows, se Python è installato tramite il launcher, puoi usare `py -m http.server 8000`.

Usa un server locale: aprire `index.html` con un doppio clic tramite `file://` non è sufficiente per i moduli JavaScript e i worker dell'applicazione.

## Gesture

Il controllo con le mani è opzionale. Apri **Gesture**, attiva la videocamera e concedi il relativo permesso del browser. Per questa funzione usa il sito pubblicato in HTTPS oppure `localhost` durante le prove locali.

| Posa | Comando |
| --- | --- |
| Un palmo aperto | Orienta la vista dell'ala. |
| Un pugno chiuso | Mette in pausa l'animazione. |
| Due palmi aperti | Avvia la dimostrazione dal 2D al 3D. |
| Due pugni chiusi | Apre la vista della superficie vorticosa. |

Il modello di riconoscimento, i file WASM e il relativo codice sono inclusi in `assets/models/` e `vendor/mediapipe/`. Queste risorse costituiscono la maggior parte del peso dell'esportazione e devono rimanere disponibili per le gesture.

## Dipendenze e licenze

Conserva le licenze incluse: `vendor/THREE-LICENSE.txt` e i file in `assets/licenses/`, relativi a MediaPipe, Phosphor Icons, Space Grotesk e JetBrains Mono.

Il laboratorio è un modello didattico di ala finita. Le traiettorie illustrative e la colorazione della pressione non costituiscono una soluzione CFD.
