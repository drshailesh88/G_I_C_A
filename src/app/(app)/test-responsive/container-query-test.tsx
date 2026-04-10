export function ContainerQueryTest() {
  return (
    <div className="@container">
      <div className="flex flex-col @md:flex-row @lg:grid @lg:grid-cols-3">
        {[1, 2, 3].map((n) => (
          <div key={n} className="@container/card @sm:p-2 @md:p-4 @lg:p-6 @xl:p-8">
            Card {n}
          </div>
        ))}
      </div>
    </div>
  );
}
