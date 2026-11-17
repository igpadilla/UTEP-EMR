export default function RoomsSlot({ encounterId, simulationId }) {
    return (
        <div className="rooms-slot-placeholder" aria-disabled="true" aria-label="Room assignment unavailable">
            <span className="rooms-slot-label">Room assignment — coming soon</span>
        </div>
    );
}
