import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { AlarmForm } from "../components/alarms/AlarmForm";
import { useBackNavigation } from "../libs/back-navigation";
import { draftToFormInput, replaceDraftWithInputs } from "../libs/ai/alarm-draft";
import { useAiDrafts } from "../libs/ai/draft-context";

export function AiDraftFormPage() {
  const { draftIndex } = useParams();
  const index = draftIndex && /^\d+$/.test(draftIndex) ? Number(draftIndex) : -1;
  const { drafts, setDrafts } = useAiDrafts();
  const draft = drafts[index];
  const navigate = useNavigate();
  const goBack = useBackNavigation();

  useEffect(() => {
    if (!draft) void navigate("/ai", { replace: true });
  }, [draft, navigate]);

  if (!draft) return null;

  return (
    <AlarmForm
      key={index}
      initialInput={draftToFormInput(draft)}
      editing
      allowPastDates
      saveLabel="Salvar alterações"
      onCancel={goBack}
      onSave={async (inputs) => {
        // Only update the preview; confirmation in AiPage creates the alarms.
        setDrafts((current) => replaceDraftWithInputs(current, index, inputs));
        await goBack();
      }}
    />
  );
}
