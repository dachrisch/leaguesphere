type Props = {
  pending: number;
};

function StatusChip({ pending }: Props) {
  return (
    <span className={pending > 0 ? "status-chip pending" : "status-chip"}>
      {pending > 0 ? `${pending} warten` : "Synchron"}
    </span>
  );
}

export default StatusChip;
