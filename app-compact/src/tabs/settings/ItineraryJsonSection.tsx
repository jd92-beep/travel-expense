import { Download, RotateCcw, Upload } from 'lucide-react';
import { useRef } from 'react';
import { AccordionCard } from '../../components/AccordionCard';
import { ITINERARY } from '../../lib/constants';
import {
  redactedError,
} from '../../lib/credentialBroker';
import { downloadJson, getItinerary, validateItinerary } from '../../lib/domain';
import { type SettingsContext } from './shared';

export function ItineraryJsonSection({ ctx }: { ctx: SettingsContext }) {
  const { state, updateState, setStatus, currentTrip, trips } = ctx;
  const itineraryInput = useRef<HTMLInputElement | null>(null);

  async function importItinerary(file?: File) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const result = validateItinerary(parsed);
      if (!result.ok) throw new Error(result.error);
      if (!result.itinerary.length) throw new Error('行程為空');
      const nextTrip = {
        ...currentTrip,
        itinerary: result.itinerary,
        startDate: result.itinerary[0].date,
        endDate: result.itinerary[result.itinerary.length - 1].date,
        version: currentTrip.version + 1,
        updatedAt: Date.now(),
      };
      updateState({
        trips: trips.map((trip) => trip.id === currentTrip.id ? nextTrip : trip),
        customItinerary: result.itinerary,
        itineraryOverrides: {},
        tripDateRange: { start: nextTrip.startDate, end: nextTrip.endDate },
      });
      setStatus(`已匯入 ${result.itinerary.length} 日行程`);
    } catch (error) {
      setStatus(`行程匯入失敗：${redactedError(error)}`);
    } finally {
      if (itineraryInput.current) itineraryInput.current.value = '';
    }
  }

  return (
    <>
    <AccordionCard id="settings-itinerary-json" title="行程 JSON" defaultOpen={false} meta={<span className="pill">{getItinerary(state).length} 日</span>}>
      <input ref={itineraryInput} hidden type="file" accept="application/json,.json" onChange={(e) => importItinerary(e.target.files?.[0])} />
      <div className="action-row wrap">
        <button className="secondary" type="button" onClick={() => downloadJson(`${state.tripName || 'trip'}-itinerary.json`, getItinerary(state))}><Download size={18} /> 匯出行程</button>
        <button className="secondary" type="button" onClick={() => itineraryInput.current?.click()}><Upload size={18} /> 匯入行程</button>
        <button className="danger" type="button" onClick={() => updateState({ customItinerary: null, itineraryOverrides: {}, tripDateRange: { start: ITINERARY[0].date, end: ITINERARY[ITINERARY.length - 1].date } })}><RotateCcw size={18} /> 還原預設</button>
      </div>
    </AccordionCard>
    </>
  );
}
