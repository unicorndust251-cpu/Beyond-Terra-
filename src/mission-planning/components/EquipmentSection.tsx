import type { Dispatch } from 'react';
import {
  CATEGORY_LABELS,
  EQUIPMENT,
  MASS_GROUP_LABELS,
  TASKS,
  type EquipmentCategory,
  type MassGroup,
} from '../data/science';
import { MARS_GRAVITY, massBreakdown, type MissionAction, type MissionState } from '../model';

interface Props {
  state: MissionState;
  dispatch: Dispatch<MissionAction>;
}

const kg = (v: number) => `${v.toFixed(1)} kg`;

export default function EquipmentSection({ state, dispatch }: Props) {
  const mass = massBreakdown(state);
  const categories = Object.keys(CATEGORY_LABELS) as EquipmentCategory[];

  return (
    <div className="mp-equipment">
      <p className="mp-note mp-note--strong">
        Masses and operating times are example planning assumptions, not NASA specifications. Items marked “concept” are
        not existing EVA hardware, and no item here is approved for Mars EVA use.
      </p>

      {categories.map((cat) => (
        <section key={cat} className="mp-equipment__category" aria-label={CATEGORY_LABELS[cat]}>
          <h4>{CATEGORY_LABELS[cat]}</h4>
          <ul>
            {EQUIPMENT.filter((e) => e.category === cat).map((item) => {
              const selected = state.equipment[item.id];
              const minutes = item.tasks.map((t) => TASKS[t].assumedMinutes);
              return (
                <li key={item.id} className={selected ? 'is-selected' : ''}>
                  <label className="mp-check">
                    <input type="checkbox" checked={!!selected} onChange={() => dispatch({ type: 'toggle-equipment', id: item.id })} />
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.purpose}</small>
                    </span>
                  </label>
                  <dl className="mp-equipment__meta">
                    <div>
                      <dt>Mass</dt>
                      <dd>
                        {selected ? (
                          <input
                            type="number"
                            min={0}
                            step={0.1}
                            aria-label={`${item.name} mass in kilograms`}
                            value={selected.massKg}
                            onChange={(e) =>
                              dispatch({ type: 'set-equipment-mass', id: item.id, massKg: Math.max(0, Number(e.target.value) || 0) })
                            }
                          />
                        ) : (
                          <span className="mp-data">{item.assumedMassKg.toFixed(1)}</span>
                        )}{' '}
                        kg <em>example assumption</em>
                      </dd>
                    </div>
                    <div>
                      <dt>Counts as</dt>
                      <dd>{MASS_GROUP_LABELS[item.massGroup]}</dd>
                    </div>
                    {item.tasks.length > 0 && (
                      <div>
                        <dt>Tasks</dt>
                        <dd>{item.tasks.map((t) => TASKS[t].name).join(', ')}</dd>
                      </div>
                    )}
                    {minutes.length > 0 && (
                      <div>
                        <dt>Operating time</dt>
                        <dd>
                          {Math.min(...minutes) === Math.max(...minutes)
                            ? `${minutes[0]} min`
                            : `${Math.min(...minutes)}–${Math.max(...minutes)} min`}{' '}
                          per task <em>assumed</em>
                        </dd>
                      </div>
                    )}
                  </dl>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <div className="mp-mass">
        <h4>Loadout mass</h4>
        <table className="mp-table">
          <tbody>
            <tr>
              <th scope="row">Spacesuit</th>
              <td className="mp-data">
                {mass.suitKg !== null ? `${kg(mass.suitKg)} (your assumption)` : 'No verified value: not included'}
              </td>
            </tr>
            {(Object.keys(MASS_GROUP_LABELS) as MassGroup[]).map((g) => (
              <tr key={g}>
                <th scope="row">{MASS_GROUP_LABELS[g]}</th>
                <td className="mp-data">{kg(mass.byGroup[g])}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total carried (excluding suit)</th>
              <td className="mp-data">{kg(mass.carriedKg)}</td>
            </tr>
            <tr>
              <th scope="row">Per astronaut (shared evenly, {state.crew})</th>
              <td className="mp-data">{kg(mass.perAstronautKg)}</td>
            </tr>
          </tfoot>
        </table>

        <label className="mp-field">
          <span>Suit mass assumption (kg, optional)</span>
          <input
            type="number"
            min={0}
            step={1}
            placeholder="No verified value"
            value={state.suitMassAssumptionKg ?? ''}
            onChange={(e) =>
              dispatch({ type: 'set-suit-mass', massKg: e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0) })
            }
          />
        </label>
        <p className="mp-note">
          Mass is the same on Mars as on Earth; only weight changes. At Mars surface gravity ({MARS_GRAVITY} m/s²) the
          carried {kg(mass.carriedKg)} weighs about {(mass.carriedKg * MARS_GRAVITY).toFixed(0)} N.
        </p>
      </div>
    </div>
  );
}
