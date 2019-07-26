import * as firebase from 'firebase/app'
import 'firebase/firestore'
import { runValidationForClass } from './utils/validation';
import { PROJECTS_COLLECTION } from './constants/firestorePaths'
import { GetOptions, throwIfNotFoundInVal } from './utils/firebase';
import { ProjectValue } from './types/Project';

/**
 * Fireadmin Project
 */
// tslint:disable-next-line
export default class Project implements ProjectValue {
  public path: string
  public id: string
  public ref: firebase.firestore.DocumentReference
  public listen: any
  public updatedAt?: firebase.firestore.FieldValue
  public createdAt?: firebase.firestore.FieldValue
  constructor(projectId: string, projectData?: object) {
    this.id = projectId
    this.path = `${PROJECTS_COLLECTION}/${projectId}`
    this.ref = firebase.firestore().doc(this.path)
    this.listen = this.ref.onSnapshot
    if (projectData) {
      Object.assign(this, projectData);
    }
  }
  /**
   * Validate a Project using JSON schema
   */
  public validate(projectData: ProjectValue) {
    runValidationForClass(Project, projectData);
  }
  /**
   * Get a Project and throw if is not found
   */
  public async get(options?: GetOptions): Promise<Project> {
    const snap = await this.ref.get();
    const projectVal = throwIfNotFoundInVal(snap, options, `Project not found at path: ${this.path}`)
    return new Project(this.id, projectVal);
  }

  /**
   * Update a Project (uses JSON schema for validation)
   */
  public update(projectData: ProjectValue): Promise<any> {
    this.validate(projectData);
    return this.ref.update(projectData)
  }

  public delete() {
    return this.ref.delete()
  }
}
