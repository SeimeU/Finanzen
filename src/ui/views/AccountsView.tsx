import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { ASSET_CLASSES, type AccountView, type Classification, type HoldingView, type InstitutionView } from "../../core";
import { api, ApiError, type Structure } from "../api";
import { ASSET_CLASS_LABELS, formatClassification, LIQUIDITY_LABELS } from "../labels";

/**
 * Settings view for Institute → Konten → Positionen. Every form submits one core
 * command; the server saves immediately and replies with the updated tree.
 */
export function AccountsView({ onOpenAccount }: { onOpenAccount: (accountId: string) => void }) {
  const [structure, setStructure] = useState<InstitutionView[] | null>(null);

  useEffect(() => {
    api.structure().then((r) => setStructure(r.structure));
  }, []);

  if (structure === null) return null;
  const apply = (r: Structure) => setStructure(r.structure);

  return (
    <main className="page">
      <h1>Institute, Konten und Positionen</h1>
      {structure.length === 0 && <p className="empty">Noch keine Institute angelegt.</p>}
      {structure.map((institution) => (
        <InstitutionSection key={institution.id} institution={institution} onChange={apply} onOpenAccount={onOpenAccount} />
      ))}
      <NameForm
        label="Institut anlegen"
        submitLabel="Institut anlegen"
        initialName=""
        onSubmit={(name) => api.createInstitution({ name }).then(apply)}
      />
    </main>
  );
}

type OnChange = (r: Structure) => void;

function InstitutionSection({
  institution,
  onChange,
  onOpenAccount,
}: {
  institution: InstitutionView;
  onChange: OnChange;
  onOpenAccount: (accountId: string) => void;
}) {
  const headingId = useId();
  const [editing, setEditing] = useState(false);
  return (
    <section className="institution" aria-labelledby={headingId}>
      <header className="row">
        <h2 id={headingId}>{institution.name}</h2>
        <button type="button" className="secondary" onClick={() => setEditing(!editing)}>
          Institut bearbeiten
        </button>
      </header>
      {editing && (
        <NameForm
          label="Institut bearbeiten"
          submitLabel="Speichern"
          initialName={institution.name}
          onSubmit={(name) =>
            api.updateInstitution({ id: institution.id, name }).then((r) => {
              onChange(r);
              setEditing(false);
            })
          }
        />
      )}
      {institution.accounts.map((account) => (
        <AccountSection key={account.id} account={account} onChange={onChange} onOpen={() => onOpenAccount(account.id)} />
      ))}
      <AccountForm
        label="Konto anlegen"
        submitLabel="Konto anlegen"
        onSubmit={(input) => api.createAccount({ ...input, institutionId: institution.id }).then(onChange)}
      />
    </section>
  );
}

function AccountSection({ account, onChange, onOpen }: { account: AccountView; onChange: OnChange; onOpen: () => void }) {
  const headingId = useId();
  const [editing, setEditing] = useState(false);
  return (
    <section className="account" aria-labelledby={headingId}>
      <header className="row">
        <h3 id={headingId}>{account.name}</h3>
        {account.isDebt && <span className="badge">Schulden</span>}
        <button type="button" className="secondary" onClick={onOpen}>
          Konto ansehen
        </button>
        <button type="button" className="secondary" onClick={() => setEditing(!editing)}>
          Konto bearbeiten
        </button>
      </header>
      <p className="meta">
        {account.iban && <>IBAN: {account.iban} · </>}
        Standardeinordnung: {formatClassification(account.defaultClassification)}
      </p>
      {editing && (
        <AccountForm
          label="Konto bearbeiten"
          submitLabel="Speichern"
          initial={account}
          onSubmit={(input) =>
            api.updateAccount({ ...input, id: account.id }).then((r) => {
              onChange(r);
              setEditing(false);
            })
          }
        />
      )}
      {account.holdings.length > 0 && (
        <ul className="holdings">
          {account.holdings.map((holding) => (
            <HoldingItem key={holding.id} holding={holding} onChange={onChange} />
          ))}
        </ul>
      )}
      <HoldingForm
        label="Position anlegen"
        submitLabel="Position anlegen"
        initialClassification={account.defaultClassification}
        onSubmit={(input) => api.createHolding({ ...input, accountId: account.id }).then(onChange)}
      />
    </section>
  );
}

function HoldingItem({ holding, onChange }: { holding: HoldingView; onChange: OnChange }) {
  const [editing, setEditing] = useState(false);
  return (
    <li>
      <div className="row">
        <span>
          <strong>{holding.name}</strong> · {formatClassification(holding.classification)}
        </span>
        <button type="button" className="secondary" onClick={() => setEditing(!editing)}>
          Position bearbeiten
        </button>
      </div>
      {editing && (
        <HoldingForm
          label="Position bearbeiten"
          submitLabel="Speichern"
          initialName={holding.name}
          initialClassification={holding.classification}
          onSubmit={(input) =>
            api.updateHolding({ ...input, id: holding.id }).then((r) => {
              onChange(r);
              setEditing(false);
            })
          }
        />
      )}
    </li>
  );
}

// --- forms ---

/** A form that shows a core validation error (German) as an alert and keeps the input on failure. */
function CommandForm(props: {
  label: string;
  submitLabel: string;
  onSubmit: () => Promise<unknown>;
  onSuccess?: () => void;
  children: ReactNode;
}) {
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await props.onSubmit();
      setError(null);
      props.onSuccess?.();
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      setError(e.message);
    }
  }
  return (
    <form aria-label={props.label} className="inline-form" onSubmit={submit}>
      {props.children}
      {error && <p role="alert">{error}</p>}
      <button type="submit">{props.submitLabel}</button>
    </form>
  );
}

function NameForm(props: { label: string; submitLabel: string; initialName: string; onSubmit: (name: string) => Promise<unknown> }) {
  const [name, setName] = useState(props.initialName);
  return (
    <CommandForm
      label={props.label}
      submitLabel={props.submitLabel}
      onSubmit={() => props.onSubmit(name)}
      onSuccess={() => setName(props.initialName)}
    >
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
    </CommandForm>
  );
}

const AVAILABLE_CASH: Classification = { assetClass: "cash", liquidity: "available", maturityDate: null };

type AccountFields = { name: string; iban: string | null; isDebt: boolean; defaultClassification: Classification };

function AccountForm(props: {
  label: string;
  submitLabel: string;
  initial?: AccountFields;
  onSubmit: (input: AccountFields) => Promise<unknown>;
}) {
  const empty: AccountFields = { name: "", iban: null, isDebt: false, defaultClassification: AVAILABLE_CASH };
  const [fields, setFields] = useState<AccountFields>(props.initial ?? empty);
  return (
    <CommandForm
      label={props.label}
      submitLabel={props.submitLabel}
      onSubmit={() => props.onSubmit(fields)}
      onSuccess={() => setFields(props.initial ?? empty)}
    >
      <label>
        Name
        <input value={fields.name} onChange={(e) => setFields({ ...fields, name: e.target.value })} />
      </label>
      <label>
        IBAN
        <input
          value={fields.iban ?? ""}
          placeholder="optional"
          onChange={(e) => setFields({ ...fields, iban: e.target.value })}
        />
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={fields.isDebt}
          onChange={(e) => setFields({ ...fields, isDebt: e.target.checked })}
        />
        Schulden
      </label>
      <fieldset>
        <legend>Standardeinordnung</legend>
        <ClassificationFields
          value={fields.defaultClassification}
          onChange={(defaultClassification) => setFields({ ...fields, defaultClassification })}
        />
      </fieldset>
    </CommandForm>
  );
}

function HoldingForm(props: {
  label: string;
  submitLabel: string;
  initialName?: string;
  initialClassification: Classification;
  onSubmit: (input: { name: string; classification: Classification }) => Promise<unknown>;
}) {
  const [name, setName] = useState(props.initialName ?? "");
  const [classification, setClassification] = useState(props.initialClassification);
  return (
    <CommandForm
      label={props.label}
      submitLabel={props.submitLabel}
      onSubmit={() => props.onSubmit({ name, classification })}
      onSuccess={() => {
        setName(props.initialName ?? "");
        setClassification(props.initialClassification);
      }}
    >
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <ClassificationFields value={classification} onChange={setClassification} />
    </CommandForm>
  );
}

function ClassificationFields({ value, onChange }: { value: Classification; onChange: (c: Classification) => void }) {
  return (
    <div className="row">
      <label>
        Anlageklasse
        <select
          value={value.assetClass}
          onChange={(e) => onChange({ ...value, assetClass: e.target.value as Classification["assetClass"] })}
        >
          {ASSET_CLASSES.map((c) => (
            <option key={c} value={c}>
              {ASSET_CLASS_LABELS[c]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Verfügbarkeit
        <select
          value={value.liquidity}
          onChange={(e) => onChange({ ...value, liquidity: e.target.value as Classification["liquidity"] })}
        >
          <option value="available">{LIQUIDITY_LABELS.available}</option>
          <option value="locked">{LIQUIDITY_LABELS.locked}</option>
        </select>
      </label>
      {value.liquidity === "locked" && (
        <label>
          Fälligkeit
          <input
            type="date"
            value={value.maturityDate ?? ""}
            onChange={(e) => onChange({ ...value, maturityDate: e.target.value || null })}
          />
        </label>
      )}
    </div>
  );
}
