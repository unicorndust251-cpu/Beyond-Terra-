import MainNav from '../../components/MainNav';
import { useHazardState } from '../../shared';

/** The main navigation in the map's top bar; the current section is the map's own view. */
export default function ViewSwitch() {
  const { view } = useHazardState();
  return <MainNav current={view} />;
}
