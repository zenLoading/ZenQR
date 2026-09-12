import { render } from "preact";
import { apiNs } from "../utils/compat";
import { usePageTitle } from "../utils/hooks";
import BatchGenerator from "./components/BatchGenerator";

function BatchPage() {
  usePageTitle(apiNs.i18n.getMessage("batch_generator_window_title"));
  return <BatchGenerator />;
}

render(<BatchPage />, document.body);
