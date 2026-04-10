interface Props {
  title: string;
  message?: string;
}

export default function ErrorState({ title, message }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
        <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <div>
        <h3 className="text-lg font-semibold text-slate-200">{title}</h3>
        {message && <p className="text-sm text-slate-500 mt-1 max-w-md">{message}</p>}
      </div>
      <p className="text-xs text-slate-600">Other tabs are still fully functional</p>
    </div>
  );
}
