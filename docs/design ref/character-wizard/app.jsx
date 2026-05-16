/* global React, ReactDOM */
const { useState, useMemo, useEffect } = React;

const ANCESTRIES = window.CW_ANCESTRIES;
const CULTURES = window.CW_CULTURES;
const LANGUAGES = window.CW_LANGUAGES;
const CAREERS = window.CW_CAREERS;
const CLASSES = window.CW_CLASSES;
const ARRAYS = window.CW_CHAR_ARRAYS;
const COMPS = window.CW_COMPLICATIONS;
const KITS = window.CW_KITS;
const PACKS = window.CW_PACKS;
const STEPS = window.CW_STEPS;
const SKILL_LIST = window.CS_SKILL_LIST;

const CHAR_KEYS = ['Might', 'Agility', 'Reason', 'Intuition', 'Presence'];

/* =========================================================
   Top bar — same vocabulary as Character Sheet
   ========================================================= */
function TopBar({ pack }) {
  return (
    <header className="topbar">
      <div className="tb-brand">
        <div className="tb-mark" />
        <span className="name">Ironyard</span>
      </div>
      <div className="tb-divider" />
      <nav className="cs-nav">
        <a href="#">Home</a>
        <a href="#">Campaigns</a>
        <a href="#" className="on">
          Characters
        </a>
        <a href="#">Foes</a>
      </nav>
      <div className="tb-spacer" />
      <div className="tb-stat">
        <span>Pack</span>
        <b style={{ textTransform: 'capitalize' }}>{pack}</b>
      </div>
      <button className="tb-btn">Tweaks</button>
      <button className="tb-btn">Discard</button>
      <button className="tb-btn primary">Save draft</button>
    </header>
  );
}

/* =========================================================
   Header (step rail + title)
   ========================================================= */
function WizardHead({ state, setStep, mode }) {
  const cur = STEPS.find((s) => s.id === state.step);
  const curIdx = STEPS.indexOf(cur);
  return (
    <div className="cw-head">
      <div className="cw-crumb">
        <span>Characters</span>
        <span className="sep">/</span>
        <b>{state.name || 'Untitled'}</b>
        <span className="sep">/</span>
        <span>{mode}</span>
      </div>
      <h1 className="cw-title">
        {mode === 'Edit' ? 'Edit character' : 'New character'}
        <span className="progress">
          Step {cur.num} of {STEPS.length} · {cur.label}
        </span>
      </h1>
      <div className="cw-rail">
        {STEPS.map((s, i) => {
          const done = i < curIdx;
          return (
            <button
              key={s.id}
              className={`cw-step ${state.step === s.id ? 'on' : ''} ${done ? 'done' : ''}`}
              onClick={() => setStep(s.id)}
            >
              <span className="num">
                <span>{s.num}</span>
              </span>
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================
   Footer (back / continue)
   ========================================================= */
function WizardFoot({ state, setStep }) {
  const idx = STEPS.findIndex((s) => s.id === state.step);
  const prev = STEPS[idx - 1];
  const next = STEPS[idx + 1];
  return (
    <div className="cw-foot">
      <div className="status">
        <span className="dot" />
        <span>Draft saved · 12 sec ago</span>
      </div>
      <div className="actions">
        <button className="tb-btn" disabled={!prev} onClick={() => prev && setStep(prev.id)}>
          ← Back
        </button>
        {next ? (
          <button className="tb-btn primary" onClick={() => setStep(next.id)}>
            Save & Continue →
          </button>
        ) : (
          <button className="tb-btn primary">▶ Finish character</button>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   STEP: Name & Details
   ========================================================= */
function StepName({ state, set }) {
  return (
    <>
      <p className="cw-sub">
        The basics. Pick a name your party can yell across a battlefield, a pack color so they can
        pick you out at a glance, and any private notes for yourself.
      </p>

      <div className="cw-section">
        <div className="cw-lbl">
          <span className="k">Identity</span>
        </div>
        <div className="cw-row">
          <span className="k">Name</span>
          <input
            className="cw-input"
            value={state.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </div>
        <div className="cw-row">
          <span className="k">Pronouns</span>
          <input
            className="cw-input"
            value={state.pronouns}
            onChange={(e) => set({ pronouns: e.target.value })}
          />
        </div>
        <div className="cw-row">
          <span className="k">Controller</span>
          <input
            className="cw-input"
            value={state.controller}
            onChange={(e) => set({ controller: e.target.value })}
          />
        </div>
        <div className="cw-row">
          <span className="k">Sigil</span>
          <input
            className="cw-input"
            style={{
              maxWidth: 100,
              fontFamily: '"Geist Mono", monospace',
              letterSpacing: '0.08em',
            }}
            maxLength={3}
            value={state.sigil}
            onChange={(e) => set({ sigil: e.target.value.toUpperCase() })}
          />
        </div>
      </div>

      <div className="cw-section">
        <div className="cw-lbl">
          <span className="k">Pack color</span>
          <span className="help">Drives accent across sheet, lobby, and battlemap.</span>
        </div>
        <div className="cw-swatch-row">
          {PACKS.map((p) => (
            <button
              key={p.id}
              className={`cw-swatch ${state.pack === p.id ? 'on' : ''}`}
              style={{ '--sw': p.swatch }}
              onClick={() => set({ pack: p.id })}
            >
              <i /> {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="cw-section">
        <div className="cw-lbl">
          <span className="k">Notes</span>
          <span className="help">Private to you. The director sees nothing here.</span>
        </div>
        <textarea
          className="cw-textarea"
          value={state.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </div>
    </>
  );
}

/* =========================================================
   STEP: Ancestry
   ========================================================= */
function StepAncestry({ state, set }) {
  return (
    <>
      <p className="cw-sub">
        Where your body came from. Sets your size, base speed, and two ancestry traits. Doesn't tell
        anyone how to live — that's the next two steps.
      </p>
      <div className="cw-cards">
        {ANCESTRIES.map((a) => (
          <button
            key={a.id}
            className={`cw-card ${state.ancestry === a.id ? 'on' : ''}`}
            onClick={() => set({ ancestry: a.id })}
          >
            <div className="nm">
              {a.name}
              <span className="tag">{a.tagline}</span>
            </div>
            <div className="meta">
              <span>
                Size <b>{a.size}</b>
              </span>
              <span>
                Speed <b>{a.speed}</b>
              </span>
              <span>{a.traits.length} traits</span>
            </div>
            <div className="blurb">{a.blurb}</div>
          </button>
        ))}
      </div>
    </>
  );
}

/* =========================================================
   STEP: Culture
   ========================================================= */
function StepCulture({ state, set }) {
  const cu = state.culture;
  const setCu = (patch) => set({ culture: { ...cu, ...patch } });
  const toggleLang = (l) => {
    const has = cu.languages.includes(l);
    setCu({ languages: has ? cu.languages.filter((x) => x !== l) : [...cu.languages, l] });
  };
  const block = (key, items, title, subtitle) => (
    <div className="cw-section">
      <div className="cw-lbl">
        <span className="k">{title}</span>
        <span className="help">{subtitle}</span>
      </div>
      <div className="cw-cards">
        {items.map((it) => (
          <button
            key={it.id}
            className={`cw-card ${cu[key] === it.id ? 'on' : ''}`}
            onClick={() => setCu({ [key]: it.id })}
          >
            <div className="nm">{it.name}</div>
            <div className="blurb">{it.body}</div>
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <>
      <p className="cw-sub">
        Three slices of background — where you grew up, who ran the place, and how you were raised.
        Each grants a skill or two; together they shape the kind of trouble you find familiar.
      </p>
      {block('environment', CULTURES.environment, 'Environment', 'Where you grew up')}
      {block('organization', CULTURES.organization, 'Organization', 'How the place was run')}
      {block('upbringing', CULTURES.upbringing, 'Upbringing', 'What you were taught to do')}
      <div className="cw-section">
        <div className="cw-lbl">
          <span className="k">Languages</span>
          <span className="help">
            You know your culture's. Pick {cu.languages.length} more if your culture grants them.
          </span>
        </div>
        <div className="cw-chips">
          {LANGUAGES.map((l) => (
            <button
              key={l}
              className={`cw-chip ${cu.languages.includes(l) ? 'on' : ''}`}
              onClick={() => toggleLang(l)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/* =========================================================
   STEP: Career
   ========================================================= */
function StepCareer({ state, set }) {
  return (
    <>
      <p className="cw-sub">
        What you did before all this started. Sets three skills, a small narrative perk, and the
        inciting incident that pushed you toward heroism.
      </p>
      <div className="cw-cards">
        {CAREERS.map((c) => (
          <button
            key={c.id}
            className={`cw-card ${state.career === c.id ? 'on' : ''}`}
            onClick={() => set({ career: c.id })}
          >
            <div className="nm">{c.name}</div>
            <div className="blurb">{c.blurb}</div>
            <div className="twobody">
              <div>
                <div className="lbl">Skills</div>
                <div className="txt">{c.skills.join(' · ')}</div>
              </div>
              <div>
                <div className="lbl">Perk</div>
                <div className="txt">{c.perk}</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="cw-section" style={{ marginTop: 22 }}>
        <div className="cw-lbl">
          <span className="k">Inciting incident</span>
          <span className="help">
            The moment you stopped being just a{' '}
            {CAREERS.find((c) => c.id === state.career)?.name.toLowerCase()}.
          </span>
        </div>
        <textarea
          className="cw-textarea"
          value={state.inciting}
          onChange={(e) => set({ inciting: e.target.value })}
        />
      </div>
    </>
  );
}

/* =========================================================
   STEP: Class
   ========================================================= */
function StepClass({ state, set }) {
  const cls = CLASSES.find((c) => c.id === state.classId);
  const arr = ARRAYS.find((a) => a.id === state.arrayId);
  const lockedKeys = (cls?.locked || []).map((l) => l.char);
  const freeKeys = CHAR_KEYS.filter((k) => !lockedKeys.includes(k));

  const onCardClick = (id) => {
    const next = CLASSES.find((c) => c.id === id);
    set({
      classId: id,
      subclass: next.subclasses[0].id,
      // reset assignments when class changes
      assign: Object.fromEntries(
        CHAR_KEYS.filter((k) => !next.locked.map((l) => l.char).includes(k)).map((k) => [k, null]),
      ),
    });
  };

  const onArrayClick = (id) => {
    set({ arrayId: id, assign: Object.fromEntries(freeKeys.map((k) => [k, null])) });
  };

  // Find which array slots are still unassigned
  const placed = Object.values(state.assign).filter((v) => v !== null);
  const remaining = useMemo(() => {
    if (!arr) return [];
    const used = [...placed];
    return arr.values.filter((v) => {
      const i = used.indexOf(v);
      if (i >= 0) {
        used.splice(i, 1);
        return false;
      }
      return true;
    });
  }, [state.assign, state.arrayId]);

  // Click-to-assign: select a token, then click a slot
  const [selected, setSelected] = useState(null);
  const onSlotClick = (k) => {
    if (state.assign[k] !== null) {
      // unassign
      set({ assign: { ...state.assign, [k]: null } });
      return;
    }
    if (selected === null) return;
    set({ assign: { ...state.assign, [k]: selected.val } });
    setSelected(null);
  };

  return (
    <>
      <p className="cw-sub">
        Your class is what you do in the fight: the heroic resource you spend, the kind of damage
        you bring, the ability cards you'll spend the next 20 sessions tuning.
      </p>

      <div className="cw-cards" style={{ marginBottom: 22 }}>
        {CLASSES.map((c) => (
          <button
            key={c.id}
            className={`cw-card ${state.classId === c.id ? 'on' : ''}`}
            onClick={() => onCardClick(c.id)}
          >
            <div className="nm">
              {c.name}
              <span className="tag">{c.resource}</span>
            </div>
            <div className="blurb">{c.blurb}</div>
          </button>
        ))}
      </div>

      {cls && (
        <>
          <div className="cw-section">
            <div className="cw-lbl">
              <span className="k">Locked characteristics</span>
              <span className="help">Set by your class — these cannot be reassigned.</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {cls.locked.map((l) => (
                <span key={l.char} className="cw-locked">
                  <b>{l.char}</b>
                  <span className="v">{l.val >= 0 ? `+${l.val}` : l.val}</span>
                  <span className="lock">· locked</span>
                </span>
              ))}
            </div>
          </div>

          <div className="cw-section">
            <div className="cw-lbl">
              <span className="k">Characteristic array</span>
              <span className="help">
                Distribution for your {freeKeys.length} free characteristics.
              </span>
            </div>
            <div className="cw-arrays">
              {ARRAYS.map((a) => (
                <button
                  key={a.id}
                  className={`cw-array ${state.arrayId === a.id ? 'on' : ''}`}
                  onClick={() => onArrayClick(a.id)}
                >
                  <span className="vals">{a.label}</span>
                  <span className="note">{a.note}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="cw-section">
            <div className="cw-lbl">
              <span className="k">Assign array values</span>
              <span className="help">
                Tap a value, then tap the characteristic it goes on. Tap an assigned slot to clear
                it.
              </span>
            </div>
            <div className="cw-tokens">
              {arr.values.map((v, i) => {
                const isPlaced =
                  !remaining.includes(v) ||
                  remaining.filter((x) => x === v).indexOf(v) <
                    arr.values.slice(0, i).filter((x) => x === v).length;
                // simpler: just show all 4, dim ones that have been used in placement
                return null;
              })}
              {arr.values.map((v, i) => {
                // count how many of this v are still remaining vs how many tokens of v before this index
                const tokensOfVBeforeMe = arr.values.slice(0, i).filter((x) => x === v).length;
                const remainingOfV = remaining.filter((x) => x === v).length;
                const placed = tokensOfVBeforeMe >= remainingOfV;
                return (
                  <button
                    key={i}
                    className={`cw-token ${placed ? 'placed' : ''} ${selected && selected.idx === i ? 'on' : ''}`}
                    style={{
                      outline: selected && selected.idx === i ? '1px solid var(--accent)' : 'none',
                    }}
                    disabled={placed}
                    onClick={() => setSelected({ idx: i, val: v })}
                  >
                    {v >= 0 ? `+${v}` : v}
                  </button>
                );
              })}
            </div>
            <div className="cw-assign-list">
              {freeKeys.map((k) => (
                <div key={k} className="cw-assign-row">
                  <span className="k">{k}</span>
                  <button
                    className={`cw-drop ${state.assign[k] !== null ? 'filled' : ''}`}
                    onClick={() => onSlotClick(k)}
                  >
                    {state.assign[k] !== null
                      ? state.assign[k] >= 0
                        ? `+${state.assign[k]}`
                        : state.assign[k]
                      : selected
                        ? 'tap to place'
                        : 'drop here'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="cw-section">
            <div className="cw-lbl">
              <span className="k">Subclass</span>
              <span className="help">Picks your school within {cls.name}.</span>
            </div>
            <div className="cw-sub-tabs">
              {cls.subclasses.map((s) => (
                <button
                  key={s.id}
                  className={state.subclass === s.id ? 'on' : ''}
                  onClick={() => set({ subclass: s.id })}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          <div className="cw-note">
            <span className="lbl">Level 1</span>
            <span>
              Features: {cls.name} College · Insight · College Features · Triggered Action ·
              Hesitation Is Weakness · Kit + 4 abilities. You'll pick ability slots after Continue.
            </span>
          </div>
        </>
      )}
    </>
  );
}

/* =========================================================
   STEP: Complication
   ========================================================= */
function StepComplication({ state, set }) {
  return (
    <>
      <p className="cw-sub">
        A hook the director can pull on. Every complication comes with both an advantage and a
        price, paid in the same currency.
      </p>
      <div className="cw-cards one">
        {COMPS.map((c) => (
          <button
            key={c.id}
            className={`cw-card ${state.complication === c.id ? 'on' : ''}`}
            onClick={() => set({ complication: c.id })}
          >
            <div className="nm">{c.name}</div>
            <div className="twobody">
              <div>
                <div className="lbl">Benefit</div>
                <div className="txt">{c.benefit}</div>
              </div>
              <div>
                <div className="lbl">Drawback</div>
                <div className="txt">{c.drawback}</div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

/* =========================================================
   STEP: Kit
   ========================================================= */
function StepKit({ state, set }) {
  const cls = CLASSES.find((c) => c.id === state.classId);
  const kitList = KITS[state.classId] || KITS.default;
  return (
    <>
      <p className="cw-sub">
        Your starting kit — the weapon, armor, and bonuses you arrive at session one with. Kits
        available depend on your class ({cls?.name || '—'}).
      </p>
      <div className="cw-cards">
        {kitList.map((k) => (
          <button
            key={k.id}
            className={`cw-card ${state.kitId === k.id ? 'on' : ''}`}
            onClick={() => set({ kitId: k.id })}
          >
            <div className="nm">{k.name}</div>
            <div className="meta">
              <span>
                STA <b>{k.bonuses.stamina}</b>
              </span>
              <span>
                SPD <b>{k.bonuses.speed}</b>
              </span>
              <span>
                MLE <b>{k.bonuses.melee}</b>
              </span>
              <span>
                RNG <b>{k.bonuses.ranged}</b>
              </span>
            </div>
            <div className="twobody">
              <div>
                <div className="lbl">Weapon</div>
                <div className="txt">{k.weapon}</div>
              </div>
              <div>
                <div className="lbl">Armor</div>
                <div className="txt">{k.armor}</div>
              </div>
            </div>
            <div className="blurb">{k.notes}</div>
          </button>
        ))}
      </div>
    </>
  );
}

/* =========================================================
   STEP: Review
   ========================================================= */
function StepReview({ state }) {
  const cls = CLASSES.find((c) => c.id === state.classId);
  const anc = ANCESTRIES.find((a) => a.id === state.ancestry);
  const car = CAREERS.find((c) => c.id === state.career);
  const comp = COMPS.find((c) => c.id === state.complication);
  const kit = (KITS[state.classId] || KITS.default).find((k) => k.id === state.kitId);
  const sub = cls?.subclasses.find((s) => s.id === state.subclass);
  return (
    <>
      <p className="cw-sub">
        Final check. Everything below comes straight from your selections. The preview on the right
        is the sheet you'll get when you finish.
      </p>
      <div className="cw-review">
        <div className="cell">
          <div className="k">Name</div>
          <div className="v">{state.name}</div>
        </div>
        <div className="cell">
          <div className="k">Pronouns</div>
          <div className="v">{state.pronouns}</div>
        </div>
        <div className="cell">
          <div className="k">Ancestry</div>
          <div className="v">{anc?.name}</div>
        </div>
        <div className="cell">
          <div className="k">Career</div>
          <div className="v">{car?.name}</div>
        </div>
        <div className="cell">
          <div className="k">Class · Subclass</div>
          <div className="v">
            {cls?.name} · {sub?.name}
          </div>
        </div>
        <div className="cell">
          <div className="k">Heroic Resource</div>
          <div className="v">{cls?.resource}</div>
        </div>
        <div className="cell">
          <div className="k">Culture</div>
          <div className="v" style={{ textTransform: 'capitalize' }}>
            {state.culture.environment} · {state.culture.organization} · {state.culture.upbringing}
          </div>
        </div>
        <div className="cell">
          <div className="k">Languages</div>
          <div className="v">{state.culture.languages.join(' · ')}</div>
        </div>
        <div className="cell">
          <div className="k">Kit</div>
          <div className="v">
            {kit?.name} — {kit?.weapon}
          </div>
        </div>
        <div className="cell">
          <div className="k">Complication</div>
          <div className="v">{comp?.name}</div>
        </div>
        <div className="cell full">
          <div className="k">Inciting incident</div>
          <div
            className="v"
            style={{ fontWeight: 400, color: 'var(--text-dim)', lineHeight: 1.55 }}
          >
            {state.inciting}
          </div>
        </div>
      </div>
    </>
  );
}

/* =========================================================
   PREVIEW (right pane) — live mini character sheet
   ========================================================= */
function Preview({ state, dirty }) {
  const bodyRef = React.useRef(null);

  // Auto-scroll preview so the highlighted section sits near the top.
  React.useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const target = body.querySelector('.sec.editing');
    if (!target) {
      body.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const bodyRect = body.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const offset = targetRect.top - bodyRect.top + body.scrollTop - 18;
    body.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
  }, [dirty]);

  const cls = CLASSES.find((c) => c.id === state.classId);
  const anc = ANCESTRIES.find((a) => a.id === state.ancestry);
  const car = CAREERS.find((c) => c.id === state.career);
  const comp = COMPS.find((c) => c.id === state.complication);
  const kit = (KITS[state.classId] || KITS.default).find((k) => k.id === state.kitId);
  const sub = cls?.subclasses.find((s) => s.id === state.subclass);
  const arr = ARRAYS.find((a) => a.id === state.arrayId);
  const lockedKeys = (cls?.locked || []).map((l) => l.char);

  const ghost = (s) => s || <span className="cw-ghost">— not picked —</span>;

  // Build characteristic display
  const chars = CHAR_KEYS.map((k) => {
    const lock = cls?.locked.find((l) => l.char === k);
    if (lock) return { k, v: lock.val, locked: true, source: cls.name };
    const v = state.assign[k];
    return { k, v, locked: false, source: null };
  });

  // Combine skills from career
  const careerSkills = car?.skills || [];

  // Lineage features compiled from ancestry + class + subclass
  const features = [];
  if (cls)
    features.push({
      group: `Class · ${cls.name}`,
      items: [
        {
          name: cls.resource,
          body: `Earn ${cls.resource} during encounters; spend to fuel Heroic abilities.`,
        },
      ],
    });
  if (sub)
    features.push({
      group: `Subclass · ${sub.name}`,
      items: [
        {
          name: 'School training',
          body: `Your ${cls?.name.toLowerCase()} ability cards filter by this subclass.`,
        },
      ],
    });
  if (anc) features.push({ group: `Ancestry · ${anc.name}`, items: anc.traits });

  return (
    <div className="cw-right">
      <div className="cw-preview-head">
        <div>
          <div className="k">Preview</div>
          <div className="name">{state.name || 'Untitled character'}</div>
        </div>
        <span className="live">live</span>
      </div>
      <div ref={bodyRef} className={`cw-preview-body pack-${state.pack}`}>
        {/* Identity */}
        <div className="cw-id">
          <div className="sig">{state.sigil || '··'}</div>
          <div>
            <h2>
              {state.name || <span className="cw-ghost">Untitled</span>}
              <span className="pron">{state.pronouns}</span>
            </h2>
            <div className="line">
              <span>
                Level <b>1</b>
              </span>
              <span className="sep">·</span>
              <span>{cls ? <b>{cls.name}</b> : <span className="ghost">no class</span>}</span>
              {sub && (
                <>
                  <span className="sep">·</span>
                  <span>
                    <b>{sub.name}</b>
                  </span>
                </>
              )}
              <span className="sep">·</span>
              <span>{anc ? <b>{anc.name}</b> : <span className="ghost">no ancestry</span>}</span>
              <span className="sep">·</span>
              <span>{car ? <b>{car.name}</b> : <span className="ghost">no career</span>}</span>
            </div>
          </div>
        </div>

        {/* Vitals — derived */}
        <div className={`sec ${dirty === 'name' || dirty === 'kit' ? 'editing' : ''}`}>
          <div className="sec-head">
            <h3>Vitals</h3>
            <div className="right">at level 1</div>
          </div>
          <div className="sec-body">
            <div className="vital-grid">
              <div className="vital-row">
                <div className="k">Heroic Resource</div>
                <div className="v">
                  <span className="tab">{cls?.resource || '—'}</span>
                </div>
              </div>
              <div className="vital-row">
                <div className="k">Size · Speed</div>
                <div className="v">
                  <span className="tab">{anc?.size || '1M'}</span>
                  <span className="sep">·</span>
                  <span className="tab">{anc?.speed || 5}</span>
                </div>
              </div>
              <div className="vital-row">
                <div className="k">Stamina</div>
                <div className="v">
                  <span className="tab">22</span>
                  <span className="hint">+ kit {kit?.bonuses.stamina || '—'}</span>
                </div>
              </div>
              <div className="vital-row">
                <div className="k">Recoveries</div>
                <div className="v">
                  <span className="tab">8</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Characteristics */}
        <div className={`sec ${dirty === 'class' ? 'editing' : ''}`}>
          <div className="sec-head">
            <h3>Characteristics</h3>
            <div className="right">
              {lockedKeys.length} locked · {chars.filter((c) => !c.locked && c.v !== null).length}/
              {5 - lockedKeys.length} assigned
            </div>
          </div>
          <div className="sec-body">
            <div className="cs-chargrid">
              {chars.map((c) => (
                <div key={c.k} className={`cs-char ${c.locked ? 'locked' : ''}`}>
                  <div className="k">{c.k.slice(0, 3).toUpperCase()}</div>
                  <div className="v">{c.v === null ? '—' : c.v >= 0 ? `+${c.v}` : c.v}</div>
                  {c.locked ? (
                    <div className="src">via {c.source}</div>
                  ) : (
                    <div className="src" style={{ opacity: 0 }}>
                      ·
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Kit */}
        <div className={`sec ${dirty === 'kit' ? 'editing' : ''}`}>
          <div className="sec-head">
            <h3>
              Equipment · kit —{' '}
              {kit ? <b>{kit.name}</b> : <span className="cw-ghost">none yet</span>}
            </h3>
            <div className="right">{kit ? 'applied' : '—'}</div>
          </div>
          <div className="sec-body">
            <div className="kit">
              <div className="kit-row">
                <div className="k">Weapon</div>
                <div className="v">{ghost(kit?.weapon)}</div>
              </div>
              <div className="kit-row">
                <div className="k">Armor</div>
                <div className="v">{ghost(kit?.armor)}</div>
              </div>
              <div className="kit-row">
                <div className="k">Stamina</div>
                <div className="v">{ghost(kit?.bonuses.stamina)}</div>
              </div>
              <div className="kit-row">
                <div className="k">Speed</div>
                <div className="v">{ghost(kit?.bonuses.speed)}</div>
              </div>
              <div className="kit-row">
                <div className="k">Melee</div>
                <div className="v">{ghost(kit?.bonuses.melee)}</div>
              </div>
              <div className="kit-row">
                <div className="k">Ranged</div>
                <div className="v">{ghost(kit?.bonuses.ranged)}</div>
              </div>
              {kit && <div className="kit-note">{kit.notes}</div>}
            </div>
          </div>
        </div>

        {/* Skills */}
        <div className={`sec ${dirty === 'career' || dirty === 'culture' ? 'editing' : ''}`}>
          <div className="sec-head">
            <h3>Skills</h3>
            <div className="right">{careerSkills.length} from career</div>
          </div>
          <div className="sec-body">
            {Object.entries(SKILL_LIST).map(([group, list]) => {
              const owned = new Set(careerSkills.map((s) => s.split(': ').pop()));
              return (
                <div key={group} className="skill-group">
                  <h4>{group}</h4>
                  <div className="skill-list">
                    {list.map((s) => (
                      <span key={s} className={`skill ${owned.has(s) ? 'on' : ''}`}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Features (lineage) */}
        <div className={`sec ${dirty === 'ancestry' || dirty === 'class' ? 'editing' : ''}`}>
          <div className="sec-head">
            <h3>Features</h3>
            <div className="right">{features.length} sources</div>
          </div>
          <div className="sec-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {features.map((g) => (
              <div key={g.group}>
                <div className="skill-group" style={{ marginBottom: 6 }}>
                  <h4>{g.group}</h4>
                </div>
                <div className="tiny-list">
                  {g.items.map((it) => (
                    <div key={it.name} className="row">
                      <span>
                        <b style={{ color: 'var(--text)', fontWeight: 500 }}>{it.name}.</b>{' '}
                        {it.body}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {features.length === 0 && (
              <div className="cw-ghost" style={{ fontSize: 12 }}>
                Pick an ancestry and class to populate features.
              </div>
            )}
          </div>
        </div>

        {/* Story snippets */}
        <div
          className={`sec ${dirty === 'career' || dirty === 'complication' || dirty === 'culture' ? 'editing' : ''}`}
        >
          <div className="sec-head">
            <h3>Story</h3>
            <div className="right">background</div>
          </div>
          <div
            className="sec-body"
            style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px' }}
          >
            <div>
              <div className="lbl-mini" style={{ marginBottom: 4 }}>
                Inciting incident
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.55 }}>
                {state.inciting}
              </div>
            </div>
            {comp && comp.id !== 'none' && (
              <div>
                <div className="lbl-mini" style={{ marginBottom: 4 }}>
                  Complication · {comp.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.55 }}>
                  <b style={{ color: 'var(--text)', fontWeight: 500 }}>Benefit.</b> {comp.benefit}
                  <br />
                  <b style={{ color: 'var(--text)', fontWeight: 500 }}>Drawback.</b> {comp.drawback}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   App
   ========================================================= */
function App() {
  const [state, setState] = useState(window.CW_INITIAL);
  const set = (patch) => setState((s) => ({ ...s, ...patch }));
  const setStep = (id) => set({ step: id });

  useEffect(() => {
    document.body.dataset.theme = 'dark';
    document.body.dataset.pack = state.pack;
    document.body.dataset.density = 'balanced';
  }, [state.pack]);

  const renderStep = () => {
    switch (state.step) {
      case 'name':
        return <StepName state={state} set={set} />;
      case 'ancestry':
        return <StepAncestry state={state} set={set} />;
      case 'culture':
        return <StepCulture state={state} set={set} />;
      case 'career':
        return <StepCareer state={state} set={set} />;
      case 'class':
        return <StepClass state={state} set={set} />;
      case 'complication':
        return <StepComplication state={state} set={set} />;
      case 'kit':
        return <StepKit state={state} set={set} />;
      case 'review':
        return <StepReview state={state} />;
      default:
        return null;
    }
  };

  return (
    <>
      <TopBar pack={state.pack} />
      <main className="cw-stage">
        <div className="cw-left">
          <WizardHead state={state} setStep={setStep} mode="Edit" />
          <div className="cw-body">{renderStep()}</div>
          <WizardFoot state={state} setStep={setStep} />
        </div>
        <Preview state={state} dirty={state.step} />
      </main>
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
