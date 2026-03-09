import { Modal } from "@ashtrail/ui";
import { HistoryGallery } from "../worldgeneration/HistoryGallery";
import { useGenerationHistory } from "../hooks/useGenerationHistory";
import { useActiveWorld } from "../hooks/useActiveWorld";

interface WorldPickerModalProps {
    open: boolean;
    onClose: () => void;
}

export function WorldPickerModal({ open, onClose }: WorldPickerModalProps) {
    const { history, deleteFromHistory, renameInHistory } = useGenerationHistory();
    const { activeWorldId, setActiveWorldId } = useActiveWorld();

    return (
        <Modal open={open} onClose={onClose} title="ARCHIVES - PICK A WORLD">
            <div className="w-[80vw] h-[75vh] max-w-[1200px] flex flex-col relative overflow-hidden ring-1 ring-white/10 shadow-2xl bg-black rounded-b-xl">
                <HistoryGallery
                    history={history}
                    activePlanetId={activeWorldId}
                    deleteFromHistory={deleteFromHistory}
                    onRenameWorld={renameInHistory}
                    onSelectPlanet={(item) => {
                        setActiveWorldId(item.id);
                        onClose();
                    }}
                    onSelectTexture={() => { }}
                    showExtendedTabs={false}
                />
            </div>
        </Modal>
    );
}
