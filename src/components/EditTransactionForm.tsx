export interface EditTransactionFormProps {
  accounts: any[];
  onSuccess: () => void;
}

export const EditTransactionForm = ({
  accounts,
  onSuccess,
}: EditTransactionFormProps) => {
  const [isSubmitting, formMutate] = useActionState<
    any,
    any,
    FormData
  >(
    async (formData: FormData) => {
      onSuccess();
      return { success: true };
    },
    { success: false }
  );

  return (
    <Card title="Upraviť transakciu" subtitle="Oprava existujúceho záznamu">
      <form
        onSubmit={formMutate}
        className="space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Účet
            </label>
            <select className="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
              <option value="">Výber účtu</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Typ
            </label>
            <select className="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
              <option value="">Výber typu</option>
              <option value="income">Příjem</option>
              <option value="expense">Výdaj</option>
              <option value="transfer">Prenos</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Suma (minor)
            </label>
            <input
              type="number"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              min="0"
            />
          </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Popis
          </label>
          <input
            type="text"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            maxLength={200}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Dátum
          </label>
          <input type="date" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
        </div>

        <div className="flex justify-end space-x-3">
          <Button type="submit" disabled={isSubmitting === "pending"}>
            {isSubmitting === "pending" ? "Ukladanie..." : "Uložiť změny"}
          </Button>
          <Button type="button" variant="outline" disabled={isSubmitting === "pending"}>
            Zrušiť
          </Button>
        </div>
      </form>
    </Card>
  );
};