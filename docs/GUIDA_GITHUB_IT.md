# GitHub: guida pratica per il team

## Repository, branch e pull request

Il repository è la cartella condivisa del progetto con la cronologia delle modifiche. Un branch è una linea di lavoro separata: permette di lavorare senza modificare subito la versione comune. Una pull request (PR) propone di unire le modifiche di un branch alla versione comune, chiamata main.

- **Commit:** salva un gruppo di modifiche nella cronologia locale.
- **Push:** invia i tuoi commit dal computer a GitHub.
- **Fetch:** controlla quali aggiornamenti esistono su GitHub.
- **Pull:** porta gli aggiornamenti da GitHub nel tuo computer.
- **Merge:** integra il lavoro di un branch nell'altro.

## Aggiungere i membri

Il proprietario apre il repository e va in **Settings → Collaborators** (in alcune interfacce **Collaborators and teams**) → **Add people**. Cerca lo username GitHub di ciascun collega e invia l'invito. Ogni collega deve accettarlo.

Sono due cose distinte: essere collaboratore su GitHub e far parte del team sul sito NASA. Per la gara servono entrambe le organizzazioni correttamente completate.

## Percorso semplice con GitHub Desktop

1. Installa GitHub Desktop dal sito ufficiale e accedi con il tuo account.
2. Accetta l'invito al repository.
3. Scegli **File → Clone repository**, seleziona questo repository e una cartella locale.
4. Prima di un nuovo task: seleziona main, poi **Fetch origin** e **Pull origin**, se disponibile.
5. Crea **New branch** con un nome riconoscibile, per esempio feat/12-import-data.
6. Apri la cartella nel tuo editor e svolgi il task dopo l'inizio ufficiale della gara.
7. Controlla le modifiche, scrivi un messaggio chiaro e fai **Commit to [branch]**.
8. Premi **Publish branch** la prima volta, oppure **Push origin**.
9. Apri **Create Pull Request**, controlla che la destinazione sia main e descrivi cosa cambia.
10. Chiedi una revisione a un collega. Dopo il merge, torna su main e scarica gli aggiornamenti.

Documentazione ufficiale: https://docs.github.com/en/desktop

Se Git segnala un conflitto, fermati su quel conflitto e coordinati con il collega: non usare comandi di reset o force push per cancellarlo.

## Gestire i task

Apri **Issues → New issue → Team task**. Scrivi obiettivo, responsabile e risultato verificabile. Ogni persona dovrebbe avere un task principale alla volta. I membri vanno assegnati dopo che hanno accettato l'invito.

I task della soluzione si definiscono durante la gara: prima si possono organizzare disponibilità, strumenti e letture.

## Prima della consegna

Il repository inizialmente è privato. Se lo usate come link al progetto finale, il proprietario può renderlo pubblico da **Settings → General → Danger Zone → Change repository visibility**, dopo aver controllato i contenuti. In alternativa serve un altro link al progetto accessibile senza login.

Verifica l'accesso da una finestra privata: i giudici non useranno le vostre credenziali. Invita i membri solo da Settings; non condividere password o token.

La guida descrive il flusso di lavoro concordato. Non è attiva una regola tecnica che impedisca push diretti su main.
