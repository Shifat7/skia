export function Panel(props: {
  readonly title: string;
  readonly children: string;
}): JSX.Element {
  return (
    <section>
      <h1>{props.title}</h1>
      <div>{props.children}</div>
    </section>
  );
}
