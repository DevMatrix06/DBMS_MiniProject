import NewRepoForm from "../../_components/NewRepoForm";
import styles from "../../maintainer.module.css";

export default function NewRepoPage() {
  return (
    <>
      <h1 className={styles.h1}>New repository</h1>
      <NewRepoForm />
    </>
  );
}
